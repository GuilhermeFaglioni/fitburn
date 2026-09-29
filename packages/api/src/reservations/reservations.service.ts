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
  type MyReservationsQuery,
  type ReservationDetail,
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

const DETAIL_INCLUDE = {
  occurrence: {
    include: {
      modality: { select: { id: true, name: true } },
      instructor: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.ReservationInclude;

type ReservationWithOccurrence = Prisma.ReservationGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type Tx = Prisma.TransactionClient;

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
    return reservations.map((reservation) => this.toDetail(reservation));
  }

  async create(
    clientId: string,
    input: CreateReservationRequest,
    idempotencyKey: string,
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
          const reservationId = await this.book(tx, clientId, input.occurrenceId);
          return this.detailById(tx, reservationId);
        },
      );
    }, OCCURRENCE_TRANSACTION_OPTIONS);
    return replay(outcome);
  }

  /**
   * Cancela a própria reserva até o início da aula; a vaga volta a contar
   * como disponível no mesmo commit. Mesma ordem de locks da reserva.
   */
  async cancel(clientId: string, reservationId: string): Promise<ReservationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const { occurrenceId } = await this.findOwnReservation(tx, clientId, reservationId);
      await lockOccurrenceRows(tx, [occurrenceId]);
      await this.lockClient(tx, clientId);
      await this.cancelLocked(tx, reservationId, "cancelar");
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
          await this.cancelLocked(tx, reservationId, "remarcar");
          // Depois de validar a original: remarcar para a própria aula seria
          // cancelar e reservar de novo o mesmo lugar.
          if (original.occurrenceId === input.occurrenceId) throw this.duplicateError();
          const newReservationId = await this.book(tx, clientId, input.occurrenceId);
          return this.detailById(tx, newReservationId);
        },
      );
    }, OCCURRENCE_TRANSACTION_OPTIONS);
    return replay(outcome);
  }

  /**
   * Localiza uma reserva do cliente, antes dos locks: só lê o dono e a
   * ocorrência, que nunca mudam. O estado é revalidado depois dos locks.
   */
  private async findOwnReservation(
    tx: Tx,
    clientId: string,
    reservationId: string,
  ): Promise<{ occurrenceId: string }> {
    const reservation = await tx.reservation.findUnique({
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
   * Revalida a reserva com os locks já adquiridos e a cancela. `action` só
   * ajusta o texto da recusa de janela (cancelamento ou remarcação).
   */
  private async cancelLocked(
    tx: Tx,
    reservationId: string,
    action: "cancelar" | "remarcar",
  ): Promise<void> {
    const reservation = await tx.reservation.findUniqueOrThrow({
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
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: now },
    });
  }

  private async detailById(tx: Tx, id: string): Promise<ReservationDetail> {
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    return this.toDetail(reservation);
  }

  /** Lock por cliente, liberado no commit/rollback. */
  private lockClient(tx: Tx, clientId: string): Promise<void> {
    return lockAdvisory(tx, `reservation-client:${clientId}`);
  }

  private async assertClientActive(tx: Tx, clientId: string): Promise<void> {
    const client = await tx.user.findUnique({ where: { id: clientId }, select: { status: true } });
    if (client?.status !== UserStatus.ACTIVE) {
      throw new DomainError(
        ErrorCode.USER_INACTIVE,
        "Seu cadastro está inativo. Fale com a administração da Fitburn.",
        ErrorStatus.FORBIDDEN,
      );
    }
  }

  /** Valida a ocorrência já travada e insere a reserva confirmada. */
  private async book(tx: Tx, clientId: string, occurrenceId: string): Promise<string> {
    const occurrence = await tx.classOccurrence.findUnique({ where: { id: occurrenceId } });
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

    const duplicate = await tx.reservation.findFirst({
      where: { clientId, occurrenceId, status: ReservationStatus.CONFIRMED },
      select: { id: true },
    });
    if (duplicate) throw this.duplicateError();

    // Sobreposição com outra reserva confirmada do cliente numa aula ainda
    // agendada (intervalos semiabertos: uma aula que termina quando a outra
    // começa não conflita).
    // O lock do cliente garante que reservas concorrentes dele já estão
    // commitadas quando esta leitura acontece.
    const conflicting = await tx.reservation.findFirst({
      where: {
        clientId,
        status: ReservationStatus.CONFIRMED,
        occurrenceId: { not: occurrenceId },
        occurrence: {
          status: OccurrenceStatus.SCHEDULED,
          startsAt: { lt: occurrence.endsAt },
          endsAt: { gt: occurrence.startsAt },
        },
      },
      include: DETAIL_INCLUDE,
    });
    if (conflicting) {
      const time = formatHour(utcToGymDateTime(conflicting.occurrence.startsAt).time);
      throw new DomainError(
        ErrorCode.SCHEDULE_CONFLICT,
        `Você já tem uma reserva em ${conflicting.occurrence.name} às ${time}, no mesmo horário desta aula.`,
        ErrorStatus.CONFLICT,
        { reservation: this.toDetail(conflicting) } satisfies ScheduleConflictDetails,
      );
    }

    const booked = await tx.reservation.count({
      where: { occurrenceId, status: ReservationStatus.CONFIRMED },
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

    try {
      const reservation = await tx.reservation.create({
        data: { clientId, occurrenceId },
        select: { id: true },
      });
      return reservation.id;
    } catch (error) {
      // Última linha de defesa: o índice único parcial (cliente, ocorrência).
      if (isUniqueViolation(error)) throw this.duplicateError();
      throw error;
    }
  }

  private duplicateError(): DomainError {
    return new DomainError(
      ErrorCode.DUPLICATE_RESERVATION,
      "Você já reservou esta aula. Não é possível reservar duas vezes.",
      ErrorStatus.CONFLICT,
    );
  }

  private toDetail(reservation: ReservationWithOccurrence): ReservationDetail {
    const { occurrence } = reservation;
    return {
      id: reservation.id,
      status: reservation.status,
      occurrence: {
        id: occurrence.id,
        name: occurrence.name,
        modality: occurrence.modality,
        instructor: occurrence.instructor,
        startsAt: occurrence.startsAt.toISOString(),
        endsAt: occurrence.endsAt.toISOString(),
        durationMinutes: occurrence.durationMinutes,
        status: occurrence.status,
      },
      createdAt: reservation.createdAt.toISOString(),
      cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
    };
  }
}
