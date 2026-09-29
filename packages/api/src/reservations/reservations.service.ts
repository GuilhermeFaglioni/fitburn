import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  OccurrenceStatus,
  ReservationStatus,
  UserStatus,
  type ClassFullDetails,
  type CreateReservationRequest,
  type ApiErrorBody,
  type MyReservationsQuery,
  type ReservationDetail,
  type ReservationPreview,
  type RescheduleReservationRequest,
  type ScheduleConflictDetails,
  formatHour,
  utcToGymDateTime,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { isUniqueViolation } from "../prisma/unique-violation.js";
import { DomainError } from "../common/errors/domain-error.js";
import { lockOccurrenceRows, OCCURRENCE_TRANSACTION_OPTIONS } from "../agenda/occurrence-lock.js";
import { replay, runIdempotent } from "./idempotency.js";
import { DETAIL_INCLUDE, toReservationDetail } from "./reservation-detail.js";

type Tx = Prisma.TransactionClient;
/** Só leitura: as regras de reserva valem igual dentro de uma transação e na prévia. */
type ReadDb = Pick<Tx, "user" | "reservation" | "classOccurrence">;

/**
 * Motor de reserva: dono da regra de confirmação. A disponibilidade exibida
 * na agenda é só informativa; a decisão acontece aqui, numa transação
 * READ COMMITTED que
 * 1. trava a linha da ocorrência (FOR UPDATE) — serializa a disputa por vagas;
 * 2. adquire um lock transacional por cliente — serializa as reservas de um
 *    mesmo cliente;
 * 3. na criação e na remarcação, consulta o registro de idempotência
 *    (solicitação repetida devolve o resultado original, inclusive recusas);
 * 4. revalida tudo com o estado já travado e grava com um único commit.
 * Ordem de locks fixa em toda operação (ocorrências por id, depois cliente)
 * para não haver deadlock.
 *
 * Efeitos pós-commit (notificações, D-036) ficariam depois do `$transaction`
 * de cada operação; não fazem parte do MVP.
 */
@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Minhas reservas: futuras (aula ainda não terminou, inclusive em
   * andamento) em ordem cronológica, ou passadas da mais recente para a mais
   * antiga; opcionalmente por estado.
   */
  async listMine(clientId: string, query: MyReservationsQuery): Promise<ReservationDetail[]> {
    const now = new Date();
    const upcoming = query.when === "upcoming";
    const reservations = await this.prisma.reservation.findMany({
      where: {
        clientId,
        ...(query.status ? { status: query.status } : {}),
        occurrence: { endsAt: upcoming ? { gt: now } : { lte: now } },
      },
      include: DETAIL_INCLUDE,
      // Cancelar e reservar de novo a mesma aula gera duas linhas no mesmo
      // horário: a mais recente vem por último.
      orderBy: [
        { occurrence: { startsAt: upcoming ? "asc" : "desc" } },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    });
    return reservations.map(toReservationDetail);
  }

  async create(
    clientId: string,
    input: CreateReservationRequest,
    idempotencyKey: string,
    actorId: string = clientId,
  ): Promise<ReservationDetail> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockOccurrenceRows(tx, [input.occurrenceId]);
      await this.lockClient(tx, clientId);
      return runIdempotent(
        tx,
        clientId,
        idempotencyKey,
        { operation: "create", occurrenceId: input.occurrenceId },
        HttpStatus.CREATED,
        async () => {
          await this.assertClientActive(tx, clientId);
          const reservationId = await this.book(tx, clientId, input.occurrenceId, actorId);
          return this.detailById(tx, reservationId);
        },
      );
    }, OCCURRENCE_TRANSACTION_OPTIONS);
    return replay(outcome);
  }

  /**
   * Cancela a reserva do cliente até o início da aula; a vaga volta a contar
   * como disponível no mesmo commit. Mesma ordem de locks da reserva.
   * `actorId` é quem cancela (o cliente, ou a equipe numa reserva administrativa).
   */
  async cancel(
    clientId: string,
    reservationId: string,
    actorId: string = clientId,
  ): Promise<ReservationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const { occurrenceId } = await this.findOwnReservation(tx, clientId, reservationId);
      await lockOccurrenceRows(tx, [occurrenceId]);
      await this.lockClient(tx, clientId);
      await this.cancelLocked(tx, reservationId, "cancelar", actorId);
      return this.detailById(tx, reservationId);
    }, OCCURRENCE_TRANSACTION_OPTIONS);
  }

  /**
   * Troca a reserva por outra aula numa única transação: trava as duas
   * ocorrências (ordem determinística) e o cliente, cancela a original e
   * reserva a nova com a mesma validação da reserva comum — como a original
   * já está cancelada dentro da transação, ela não conta como conflito de
   * horário. Qualquer recusa desfaz o SAVEPOINT da operação idempotente: a
   * original permanece confirmada e o erro é o mesmo da reserva comum.
   */
  async reschedule(
    clientId: string,
    reservationId: string,
    input: RescheduleReservationRequest,
    idempotencyKey: string,
    actorId: string = clientId,
  ): Promise<ReservationDetail> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const original = await this.findOwnReservation(tx, clientId, reservationId);
      await lockOccurrenceRows(tx, [original.occurrenceId, input.occurrenceId]);
      await this.lockClient(tx, clientId);
      return runIdempotent(
        tx,
        clientId,
        idempotencyKey,
        { operation: "reschedule", reservationId, occurrenceId: input.occurrenceId },
        HttpStatus.CREATED,
        async () => {
          await this.assertClientActive(tx, clientId);
          await this.cancelLocked(tx, reservationId, "remarcar", actorId);
          // Depois de validar a original: remarcar para a própria aula seria
          // cancelar e reservar de novo o mesmo lugar.
          if (original.occurrenceId === input.occurrenceId) throw this.duplicateError();
          const newReservationId = await this.book(tx, clientId, input.occurrenceId, actorId);
          return this.detailById(tx, newReservationId);
        },
      );
    }, OCCURRENCE_TRANSACTION_OPTIONS);
    return replay(outcome);
  }

  /**
   * Prévia de "pode reservar?": aplica as mesmas regras da reserva (as mesmas
   * funções de validação), mas só lê — não trava, não grava e não registra
   * idempotência. É informativa: a decisão continua sendo da reserva de
   * verdade, e a disponibilidade pode mudar até lá. `replacingReservationId`
   * simula a remarcação dessa reserva do cliente para a aula.
   */
  async preview(
    clientId: string,
    occurrenceId: string,
    replacingReservationId?: string,
  ): Promise<ReservationPreview> {
    const occurrence = await this.prisma.classOccurrence.findUnique({
      where: { id: occurrenceId },
    });
    if (!occurrence) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
    }
    const replacing = replacingReservationId
      ? await this.findOwnReservation(this.prisma, clientId, replacingReservationId)
      : null;

    let reason: ApiErrorBody | null = null;
    try {
      await this.assertClientActive(this.prisma, clientId);
      if (replacing) {
        await this.assertCancellable(this.prisma, replacingReservationId!, "remarcar");
        if (replacing.occurrenceId === occurrenceId) throw this.duplicateError();
      }
      await this.assertBookable(this.prisma, clientId, occurrenceId, replacingReservationId);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      reason = error.getResponse() as ApiErrorBody;
    }

    const booked = await this.prisma.reservation.count({
      where: {
        occurrenceId,
        status: ReservationStatus.CONFIRMED,
        ...(replacingReservationId ? { id: { not: replacingReservationId } } : {}),
      },
    });
    return {
      canBook: reason === null,
      capacity: occurrence.capacity,
      availableSpots: Math.max(0, occurrence.capacity - booked),
      reason,
    };
  }

  /**
   * Localiza uma reserva do cliente, antes dos locks: só lê o dono e a
   * ocorrência, que nunca mudam. O estado é revalidado depois dos locks.
   */
  private async findOwnReservation(
    db: Pick<Tx, "reservation">,
    clientId: string,
    reservationId: string,
  ): Promise<{ occurrenceId: string }> {
    const reservation = await db.reservation.findUnique({
      where: { id: reservationId },
      select: { clientId: true, occurrenceId: true },
    });
    if (!reservation) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Reserva não encontrada.", ErrorStatus.NOT_FOUND);
    }
    if (reservation.clientId !== clientId) {
      throw new DomainError(
        ErrorCode.OUT_OF_SCOPE,
        "Você só pode alterar as suas próprias reservas.",
        ErrorStatus.FORBIDDEN,
      );
    }
    return { occurrenceId: reservation.occurrenceId };
  }

  /**
   * A reserva pode ser cancelada agora? Confirmada e com a aula ainda por
   * começar. `action` só ajusta o texto da recusa de janela.
   */
  private async assertCancellable(
    db: Pick<Tx, "reservation">,
    reservationId: string,
    action: "cancelar" | "remarcar",
  ): Promise<Date> {
    const reservation = await db.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: { occurrence: { select: { startsAt: true } } },
    });
    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new DomainError(
        ErrorCode.RESERVATION_NOT_ACTIVE,
        "Esta reserva não está mais ativa.",
        ErrorStatus.CONFLICT,
      );
    }
    const now = new Date();
    if (reservation.occurrence.startsAt <= now) {
      throw new DomainError(
        ErrorCode.CANCELLATION_WINDOW_CLOSED,
        `Não é mais possível ${action}: a aula já começou.`,
        ErrorStatus.CONFLICT,
      );
    }
    return now;
  }

  /** Revalida a reserva com os locks já adquiridos e a cancela, registrando quem cancelou. */
  private async cancelLocked(
    tx: Tx,
    reservationId: string,
    action: "cancelar" | "remarcar",
    actorId: string,
  ): Promise<void> {
    const now = await this.assertCancellable(tx, reservationId, action);
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: now, cancelledById: actorId },
    });
  }

  private async detailById(tx: Tx, id: string): Promise<ReservationDetail> {
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    return toReservationDetail(reservation);
  }

  /** Lock por cliente, liberado no commit/rollback. */
  private lockClient(tx: Tx, clientId: string): Promise<void> {
    return lockAdvisory(tx, `reservation-client:${clientId}`);
  }

  private async assertClientActive(db: Pick<Tx, "user">, clientId: string): Promise<void> {
    const client = await db.user.findUnique({ where: { id: clientId }, select: { status: true } });
    if (client?.status !== UserStatus.ACTIVE) {
      throw new DomainError(
        ErrorCode.USER_INACTIVE,
        "Seu cadastro está inativo. Fale com a administração da Fitburn.",
        ErrorStatus.FORBIDDEN,
      );
    }
  }

  /** Valida a ocorrência já travada e insere a reserva confirmada, registrando quem a criou. */
  private async book(
    tx: Tx,
    clientId: string,
    occurrenceId: string,
    actorId: string,
  ): Promise<string> {
    await this.assertBookable(tx, clientId, occurrenceId);
    try {
      const reservation = await tx.reservation.create({
        data: { clientId, occurrenceId, createdById: actorId },
        select: { id: true },
      });
      return reservation.id;
    } catch (error) {
      // Última linha de defesa: o índice único parcial (cliente, ocorrência).
      if (isUniqueViolation(error)) throw this.duplicateError();
      throw error;
    }
  }

  /**
   * As regras de reserva da aula: existe, pode ser reservada, o cliente não
   * está inscrito, sem conflito de horário e com vaga. Só lê — é o que a
   * reserva e a prévia compartilham. `ignoredReservationId` é a reserva que
   * está sendo remarcada (na prévia; na remarcação de verdade ela já está
   * cancelada dentro da transação).
   */
  private async assertBookable(
    db: ReadDb,
    clientId: string,
    occurrenceId: string,
    ignoredReservationId?: string,
  ): Promise<void> {
    const occurrence = await db.classOccurrence.findUnique({ where: { id: occurrenceId } });
    if (!occurrence) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
    }
    // O relógio é lido depois dos locks: quem esperou na fila até o início
    // da aula não reserva mais.
    if (occurrence.status !== OccurrenceStatus.SCHEDULED || occurrence.startsAt <= new Date()) {
      throw new DomainError(
        ErrorCode.OCCURRENCE_NOT_BOOKABLE,
        "Esta aula não pode mais ser reservada: foi cancelada ou já começou.",
        ErrorStatus.CONFLICT,
      );
    }
    const notIgnored = ignoredReservationId ? { id: { not: ignoredReservationId } } : {};

    const duplicate = await db.reservation.findFirst({
      where: { clientId, occurrenceId, status: ReservationStatus.CONFIRMED, ...notIgnored },
      select: { id: true },
    });
    if (duplicate) throw this.duplicateError();

    // Sobreposição com outra reserva confirmada do cliente numa aula ainda
    // agendada (intervalos semiabertos: uma aula que termina quando a outra
    // começa não conflita).
    // O lock do cliente garante que reservas concorrentes dele já estão
    // commitadas quando esta leitura acontece.
    const conflicting = await db.reservation.findFirst({
      where: {
        clientId,
        status: ReservationStatus.CONFIRMED,
        occurrenceId: { not: occurrenceId },
        occurrence: {
          status: OccurrenceStatus.SCHEDULED,
          startsAt: { lt: occurrence.endsAt },
          endsAt: { gt: occurrence.startsAt },
        },
        ...notIgnored,
      },
      include: DETAIL_INCLUDE,
    });
    if (conflicting) {
      const time = formatHour(utcToGymDateTime(conflicting.occurrence.startsAt).time);
      throw new DomainError(
        ErrorCode.SCHEDULE_CONFLICT,
        `Você já tem uma reserva em ${conflicting.occurrence.name} às ${time}, no mesmo horário desta aula.`,
        ErrorStatus.CONFLICT,
        { reservation: toReservationDetail(conflicting) } satisfies ScheduleConflictDetails,
      );
    }

    const booked = await db.reservation.count({
      where: { occurrenceId, status: ReservationStatus.CONFIRMED, ...notIgnored },
    });
    if (booked >= occurrence.capacity) {
      throw new DomainError(
        ErrorCode.CLASS_FULL,
        "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.",
        ErrorStatus.CONFLICT,
        {
          currentAvailableSpots: Math.max(0, occurrence.capacity - booked),
        } satisfies ClassFullDetails,
      );
    }
  }

  private duplicateError(): DomainError {
    return new DomainError(
      ErrorCode.DUPLICATE_RESERVATION,
      "Você já reservou esta aula. Não é possível reservar duas vezes.",
      ErrorStatus.CONFLICT,
    );
  }
}
