import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  addDays,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
  OccurrenceStatus,
  ReservationStatus,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";

const AGENDA_INCLUDE = {
  modality: { select: { id: true, name: true } },
  instructor: { select: { id: true, fullName: true } },
} satisfies Prisma.ClassOccurrenceInclude;

type AgendaOccurrence = Prisma.ClassOccurrenceGetPayload<{ include: typeof AGENDA_INCLUDE }>;

interface ConfirmedReservations {
  /** Quantidade de reservas confirmadas, por ocorrência. */
  countByOccurrence: Map<string, number>;
  /** Id da reserva confirmada de quem consulta, por ocorrência. */
  viewerReservationByOccurrence: Map<string, string>;
}

/** Agenda do cliente: somente leitura, só aulas futuras e não canceladas. */
@Injectable()
export class ClientAgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    from: string,
    to: string,
    viewerId: string,
    now = new Date(),
  ): Promise<ClientAgendaItem[]> {
    const rangeStart = gymDateTimeToUtc(from, "00:00");
    const occurrences = await this.prisma.classOccurrence.findMany({
      where: {
        AND: [
          this.upcomingWhere(now),
          { startsAt: { gte: rangeStart, lt: gymDateTimeToUtc(addDays(to, 1), "00:00") } },
        ],
      },
      include: AGENDA_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    const reservations = await this.confirmedReservationsOf(
      occurrences.map((occurrence) => occurrence.id),
      viewerId,
    );
    return occurrences.map((occurrence) => this.toItem(occurrence, reservations));
  }

  async findOne(id: string, viewerId: string, now = new Date()): Promise<ClientAgendaItem> {
    const occurrence = await this.prisma.classOccurrence.findFirst({
      where: { id, ...this.upcomingWhere(now) },
      include: AGENDA_INCLUDE,
    });
    if (!occurrence) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
    }
    return this.toItem(occurrence, await this.confirmedReservationsOf([occurrence.id], viewerId));
  }

  private upcomingWhere(now: Date): Prisma.ClassOccurrenceWhereInput {
    return { status: OccurrenceStatus.SCHEDULED, startsAt: { gt: now } };
  }

  private async confirmedReservationsOf(
    occurrenceIds: string[],
    viewerId: string,
  ): Promise<ConfirmedReservations> {
    if (occurrenceIds.length === 0)
      return { countByOccurrence: new Map(), viewerReservationByOccurrence: new Map() };
    const where = { occurrenceId: { in: occurrenceIds }, status: ReservationStatus.CONFIRMED };
    const [counts, mine] = await Promise.all([
      this.prisma.reservation.groupBy({ by: ["occurrenceId"], where, _count: { _all: true } }),
      this.prisma.reservation.findMany({
        where: { ...where, clientId: viewerId },
        select: { id: true, occurrenceId: true },
      }),
    ]);
    return {
      countByOccurrence: new Map(counts.map((row) => [row.occurrenceId, row._count._all])),
      viewerReservationByOccurrence: new Map(mine.map((row) => [row.occurrenceId, row.id])),
    };
  }

  private toItem(
    occurrence: AgendaOccurrence,
    reservations: ConfirmedReservations,
  ): ClientAgendaItem {
    const booked = reservations.countByOccurrence.get(occurrence.id) ?? 0;
    return {
      id: occurrence.id,
      name: occurrence.name,
      description: occurrence.description,
      modality: occurrence.modality,
      instructor: occurrence.instructor,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      durationMinutes: occurrence.durationMinutes,
      capacity: occurrence.capacity,
      available: Math.max(0, occurrence.capacity - booked),
      myReservationId: reservations.viewerReservationByOccurrence.get(occurrence.id) ?? null,
    };
  }
}
