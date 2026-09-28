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
  type ReservationDetail,
  type ScheduleConflictDetails,
  formatHour,
  utcToGymDateTime,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
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
 * Sob disputa, as transações esperam na fila do lock da ocorrência: os
 * limites padrão do Prisma (2s/5s) virariam 500 em vez da recusa correta.
 */
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 15_000,
};

/**
 * Motor de reserva: dono da regra de confirmação. A disponibilidade exibida
 * na agenda é só informativa; a decisão acontece aqui, numa transação
 * READ COMMITTED que
 * 1. trava a linha da ocorrência (FOR UPDATE) — serializa a disputa por vagas;
 * 2. adquire um lock transacional por cliente — serializa as reservas de um
 *    mesmo cliente;
 * 3. consulta o registro de idempotência (solicitação repetida devolve o
 *    resultado original, inclusive recusas);
 * 4. revalida tudo com o estado já travado e grava a reserva e o registro de
 *    idempotência com um único commit.
 * Ordem de locks fixa em toda operação (ocorrências por id, depois cliente)
 * para não haver deadlock.
 *
 * Efeitos pós-commit (notificações, D-036) ficariam depois do `$transaction`
 * de cada operação; não fazem parte do MVP.
 */
@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clientId: string,
    input: CreateReservationRequest,
    idempotencyKey: string,
  ): Promise<ReservationDetail> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockOccurrences(tx, [input.occurrenceId]);
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
    }, TRANSACTION_OPTIONS);
    return replay(outcome);
  }

  private async detailById(tx: Tx, id: string): Promise<ReservationDetail> {
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    return this.toDetail(reservation);
  }

  /** Trava as ocorrências em ordem determinística (por id). */
  private async lockOccurrences(tx: Tx, occurrenceIds: string[]): Promise<void> {
    for (const id of [...occurrenceIds].sort()) {
      await tx.$queryRaw`SELECT id FROM class_occurrences WHERE id = ${id} FOR UPDATE`;
    }
  }

  /** Lock por cliente, liberado no commit/rollback. */
  private async lockClient(tx: Tx, clientId: string): Promise<void> {
    const key = `reservation-client:${clientId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
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

/** Duck typing: com o driver adapter, `instanceof` nos erros do Prisma não é confiável. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}
