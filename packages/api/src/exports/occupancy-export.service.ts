import { Injectable } from "@nestjs/common";
import {
  OCCUPANCY_EXPORT_COLUMNS,
  OccurrenceStatus,
  type OccurrenceStatusName,
  ReservationStatus,
  utcToGymDateTime,
} from "@fitburn/contracts";
import { occurrenceScopeFilter } from "../agenda/occurrence-scope.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";
import { serializeCsv, type CsvCell } from "./csv.js";
import type { ExportPeriod } from "./export-period.js";

/** Dados de uma ocorrência necessários à linha de ocupação (sem nada de cliente ou professor). */
export interface OccupancyRecord {
  id: string;
  name: string;
  startsAt: Date;
  capacity: number;
  status: OccurrenceStatusName;
  /** Reservas que ocupam vaga: tudo exceto CANCELLED. */
  occupiedCount: number;
}

/**
 * Linha do CSV de ocupação. Função pura: a regra de cálculo fica aqui e não
 * no serviço de consulta. Percentual sem limite em 100% (a capacidade pode ter
 * sido reduzida depois das reservas) e vazio quando a capacidade é zero.
 */
export function occupancyCsvRow(record: OccupancyRecord): CsvCell[] {
  const { date, time } = utcToGymDateTime(record.startsAt);
  const occupied = record.occupiedCount;
  return [
    record.id,
    record.name,
    date,
    time,
    record.status === OccurrenceStatus.CANCELLED ? "CANCELADA" : "AGENDADA",
    record.capacity,
    occupied,
    Math.max(0, record.capacity - occupied),
    record.capacity === 0 ? null : Math.round((occupied * 1000) / record.capacity) / 10,
  ];
}

@Injectable()
export class OccupancyExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** CSV de ocupação de todas as ocorrências do período (inclusive canceladas e sem reservas). */
  async buildCsv(period: ExportPeriod, requester: ScopedRequester): Promise<string> {
    const occurrences = await this.prisma.classOccurrence.findMany({
      where: {
        startsAt: { gte: period.startsAtGte, lt: period.startsAtLt },
        ...occurrenceScopeFilter(requester),
      },
      select: {
        id: true,
        name: true,
        startsAt: true,
        capacity: true,
        status: true,
        _count: {
          select: {
            reservations: { where: { status: { not: ReservationStatus.CANCELLED } } },
          },
        },
      },
      // Sem take/skip de propósito: a exportação traz o período inteiro.
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    return serializeCsv(
      OCCUPANCY_EXPORT_COLUMNS,
      occurrences.map((occurrence) =>
        occupancyCsvRow({
          id: occurrence.id,
          name: occurrence.name,
          startsAt: occurrence.startsAt,
          capacity: occurrence.capacity,
          status: occurrence.status,
          occupiedCount: occurrence._count.reservations,
        }),
      ),
    );
  }
}
