import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addDays,
  AttendanceStatus,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
  OccurrenceStatus,
  ReservationStatus,
  type AttendanceClass,
  type AttendanceEntry,
  type AttendanceMark,
  type AttendanceRoster,
  type AttendanceStatusName,
  type ReservationStatusName,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { lockOccurrenceRows, OCCURRENCE_TRANSACTION_OPTIONS } from "../agenda/occurrence-lock.js";
import {
  isOccurrenceInScope,
  occurrenceScopeFilter,
  type ScopedRequester,
} from "../agenda/occurrence-scope.js";

const CLASS_INCLUDE = {
  modality: { select: { id: true, name: true } },
  instructor: { select: { id: true, fullName: true } },
} satisfies Prisma.ClassOccurrenceInclude;

type OccurrenceWithRelations = Prisma.ClassOccurrenceGetPayload<{ include: typeof CLASS_INCLUDE }>;

const ENTRY_INCLUDE = {
  client: { select: { id: true, fullName: true } },
} satisfies Prisma.ReservationInclude;

type ReservationWithClient = Prisma.ReservationGetPayload<{ include: typeof ENTRY_INCLUDE }>;

/** Reserva viva: a que ainda aparece na lista de presença (cancelada some). */
const LIVE_RESERVATION_STATUSES = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.COMPLETED,
  ReservationStatus.NO_SHOW,
];

const ATTENDANCE_BY_RESERVATION_STATUS: Partial<
  Record<ReservationStatusName, AttendanceStatusName>
> = {
  [ReservationStatus.CONFIRMED]: AttendanceStatus.PENDING,
  [ReservationStatus.COMPLETED]: AttendanceStatus.PRESENT,
  [ReservationStatus.NO_SHOW]: AttendanceStatus.ABSENT,
};

const RESERVATION_STATUS_BY_MARK: Record<AttendanceMark, ReservationStatusName> = {
  [AttendanceStatus.PRESENT]: ReservationStatus.COMPLETED,
  [AttendanceStatus.ABSENT]: ReservationStatus.NO_SHOW,
};

/** Andamento do registro numa aula: reservas vivas e quantas já têm presente ou faltou. */
interface Progress {
  totalCount: number;
  registeredCount: number;
}

const NO_RESERVATIONS: Progress = { totalCount: 0, registeredCount: 0 };

function progressOf(statuses: ReservationStatusName[]): Progress {
  return {
    totalCount: statuses.length,
    registeredCount: statuses.filter((status) => status !== ReservationStatus.CONFIRMED).length,
  };
}

/**
 * Presença: o professor (ou quem tem escopo mais amplo) registra presente ou
 * faltou para cada cliente com reserva confirmada de uma aula que já
 * começou. Presente conclui a reserva; faltou a marca como não compareceu.
 *
 * O registro trava a linha da ocorrência (o mesmo lock do motor de reserva e
 * das alterações administrativas), então cancelamento, substituição de
 * professor e registro nunca se atropelam.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** "Minhas aulas": aulas agendadas do período (dias locais, inclusive) no escopo do requisitante. */
  async listClasses(
    from: string,
    to: string,
    requester: ScopedRequester,
  ): Promise<AttendanceClass[]> {
    const occurrences = await this.prisma.classOccurrence.findMany({
      where: {
        startsAt: {
          gte: gymDateTimeToUtc(from, "00:00"),
          lt: gymDateTimeToUtc(addDays(to, 1), "00:00"),
        },
        status: OccurrenceStatus.SCHEDULED,
        ...occurrenceScopeFilter(requester),
      },
      include: CLASS_INCLUDE,
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    const grouped = await this.prisma.reservation.groupBy({
      by: ["occurrenceId", "status"],
      where: {
        occurrenceId: { in: occurrences.map((occurrence) => occurrence.id) },
        status: { in: LIVE_RESERVATION_STATUSES },
      },
      _count: { _all: true },
    });

    const progress = new Map<string, Progress>();
    for (const row of grouped) {
      const current = progress.get(row.occurrenceId) ?? { ...NO_RESERVATIONS };
      current.totalCount += row._count._all;
      if (row.status !== ReservationStatus.CONFIRMED) current.registeredCount += row._count._all;
      progress.set(row.occurrenceId, current);
    }

    return occurrences.map((occurrence) =>
      this.toClass(occurrence, progress.get(occurrence.id) ?? NO_RESERVATIONS),
    );
  }

  /** Lista de presença de uma aula: quem tem reserva viva, com a situação de cada um. */
  async roster(occurrenceId: string, requester: ScopedRequester): Promise<AttendanceRoster> {
    const occurrence = await this.prisma.classOccurrence.findUnique({
      where: { id: occurrenceId },
      include: CLASS_INCLUDE,
    });
    if (!occurrence) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
    }
    this.assertInScope(occurrence.instructorId, requester);

    const reservations = await this.prisma.reservation.findMany({
      where: { occurrenceId, status: { in: LIVE_RESERVATION_STATUSES } },
      include: ENTRY_INCLUDE,
      orderBy: [{ client: { fullName: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
    });

    return {
      class: this.toClass(
        occurrence,
        progressOf(reservations.map((reservation) => reservation.status)),
      ),
      entries: reservations.map((reservation) => this.toEntry(reservation)),
    };
  }

  /** Registra presente/faltou numa reserva confirmada de uma aula já iniciada. */
  async mark(
    reservationId: string,
    mark: AttendanceMark,
    requester: ScopedRequester,
  ): Promise<AttendanceEntry> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { occurrenceId: true },
      });
      if (!found) {
        throw new DomainError(
          ErrorCode.NOT_FOUND,
          "Reserva não encontrada.",
          ErrorStatus.NOT_FOUND,
        );
      }

      // Tudo o que decide o registro é lido depois do lock: o professor da
      // aula, o horário e a situação da reserva podem ter mudado até aqui.
      await lockOccurrenceRows(tx, [found.occurrenceId]);
      const reservation = await tx.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: {
          ...ENTRY_INCLUDE,
          occurrence: { select: { startsAt: true, instructorId: true } },
        },
      });

      this.assertInScope(reservation.occurrence.instructorId, requester);
      if (reservation.status !== ReservationStatus.CONFIRMED) {
        throw new DomainError(
          ErrorCode.RESERVATION_NOT_ATTENDABLE,
          "Só é possível registrar presença em reservas confirmadas que ainda não foram marcadas.",
          ErrorStatus.CONFLICT,
        );
      }
      if (reservation.occurrence.startsAt > new Date()) {
        throw new DomainError(
          ErrorCode.ATTENDANCE_NOT_OPEN,
          "A presença só pode ser registrada a partir do início da aula.",
          ErrorStatus.CONFLICT,
        );
      }

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: RESERVATION_STATUS_BY_MARK[mark] },
        include: ENTRY_INCLUDE,
      });
      return this.toEntry(updated);
    }, OCCURRENCE_TRANSACTION_OPTIONS);
  }

  private assertInScope(instructorId: string | null, requester: ScopedRequester): void {
    if (!isOccurrenceInScope(instructorId, requester)) {
      throw new DomainError(
        ErrorCode.OUT_OF_SCOPE,
        "Você só pode registrar presença nas aulas em que é o professor.",
        ErrorStatus.FORBIDDEN,
      );
    }
  }

  private toClass(occurrence: OccurrenceWithRelations, progress: Progress): AttendanceClass {
    return {
      id: occurrence.id,
      name: occurrence.name,
      modality: occurrence.modality,
      instructor: occurrence.instructor,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      durationMinutes: occurrence.durationMinutes,
      ...progress,
    };
  }

  private toEntry(reservation: ReservationWithClient): AttendanceEntry {
    const status = ATTENDANCE_BY_RESERVATION_STATUS[reservation.status];
    // Só reservas vivas chegam aqui; uma cancelada seria um erro de quem chamou.
    if (!status) throw new Error(`Reserva ${reservation.status} não tem situação de presença.`);
    return { reservationId: reservation.id, client: reservation.client, status };
  }
}
