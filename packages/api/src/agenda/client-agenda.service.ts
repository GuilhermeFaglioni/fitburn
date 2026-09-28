import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  addDays,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
  OccurrenceStatus,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";

const AGENDA_INCLUDE = {
  modality: { select: { id: true, name: true } },
  instructor: { select: { id: true, fullName: true } },
} satisfies Prisma.ClassOccurrenceInclude;

type AgendaOccurrence = Prisma.ClassOccurrenceGetPayload<{ include: typeof AGENDA_INCLUDE }>;

/** Agenda do cliente: somente leitura, só aulas futuras e não canceladas. */
@Injectable()
export class ClientAgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(from: string, to: string, now = new Date()): Promise<ClientAgendaItem[]> {
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
    return occurrences.map((occurrence) => this.toItem(occurrence));
  }

  async findOne(id: string, now = new Date()): Promise<ClientAgendaItem> {
    const occurrence = await this.prisma.classOccurrence.findFirst({
      where: { id, ...this.upcomingWhere(now) },
      include: AGENDA_INCLUDE,
    });
    if (!occurrence) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
    }
    return this.toItem(occurrence);
  }

  private upcomingWhere(now: Date): Prisma.ClassOccurrenceWhereInput {
    return { status: OccurrenceStatus.SCHEDULED, startsAt: { gt: now } };
  }

  private toItem(occurrence: AgendaOccurrence): ClientAgendaItem {
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
      // Disponibilidade = capacidade − reservas confirmadas. As reservas
      // chegam na Fase 3; até lá não há nenhuma confirmada.
      available: occurrence.capacity,
    };
  }
}
