import { Injectable } from "@nestjs/common";
import {
  OccurrenceStatus,
  type OccurrenceStatusName,
  RESERVATIONS_EXPORT_COLUMNS,
  ReservationStatus,
  utcToGymDateTime,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { serializeCsv, type CsvCell } from "./csv.js";
import type { ExportPeriod } from "./export-period.js";

/** Dados de uma ocorrência e as contagens de reservas por estado (sem nada de cliente ou professor). */
export interface ReservationsRecord {
  id: string;
  name: string;
  startsAt: Date;
  status: OccurrenceStatusName;
  confirmed: number;
  cancelled: number;
  completed: number;
  noShow: number;
}

/**
 * Linha do CSV de reservas. Função pura: a regra fica aqui e não no serviço de
 * consulta. Canceladas contam na própria coluna, mas não ocupam vaga.
 */
export function reservationsCsvRow(record: ReservationsRecord): CsvCell[] {
  const { date, time } = utcToGymDateTime(record.startsAt);
  return [
    record.id,
    record.name,
    date,
    time,
    record.status === OccurrenceStatus.CANCELLED ? "CANCELADA" : "AGENDADA",
    record.confirmed,
    record.cancelled,
    record.completed,
    record.noShow,
    record.confirmed + record.completed + record.noShow,
  ];
}

const FULL_SCOPE_MESSAGE =
  "Só quem tem acesso a todas as aulas baixa o relatório de reservas, porque contagens parciais enganariam.";

@Injectable()
export class ReservationsExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CSV de reservas agregadas por ocorrência do período (inclusive canceladas e
   * sem reservas). Só escopo total: o relatório agregado não pode mostrar contagens
   * de um recorte. A checagem vem antes de qualquer consulta.
   */
  async buildCsv(period: ExportPeriod, requester: ScopedRequester): Promise<string> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);

    const occurrenceWhere = { startsAt: { gte: period.startsAtGte, lt: period.startsAtLt } };
    // Duas leituras, sem N+1: as ocorrências (sem take/skip) e as reservas agrupadas
    // por ocorrência e estado. O índice [occurrenceId, status] atende o groupBy.
    const [occurrences, groups] = await Promise.all([
      this.prisma.classOccurrence.findMany({
        where: occurrenceWhere,
        select: { id: true, name: true, startsAt: true, status: true },
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.reservation.groupBy({
        by: ["occurrenceId", "status"],
        where: { occurrence: occurrenceWhere },
        _count: { _all: true },
      }),
    ]);

    const countsByOccurrence = new Map<string, Map<string, number>>();
    for (const group of groups) {
      const byStatus = countsByOccurrence.get(group.occurrenceId) ?? new Map<string, number>();
      byStatus.set(group.status, group._count._all);
      countsByOccurrence.set(group.occurrenceId, byStatus);
    }

    return serializeCsv(
      RESERVATIONS_EXPORT_COLUMNS,
      occurrences.map((occurrence) => {
        const byStatus = countsByOccurrence.get(occurrence.id);
        return reservationsCsvRow({
          id: occurrence.id,
          name: occurrence.name,
          startsAt: occurrence.startsAt,
          status: occurrence.status,
          confirmed: byStatus?.get(ReservationStatus.CONFIRMED) ?? 0,
          cancelled: byStatus?.get(ReservationStatus.CANCELLED) ?? 0,
          completed: byStatus?.get(ReservationStatus.COMPLETED) ?? 0,
          noShow: byStatus?.get(ReservationStatus.NO_SHOW) ?? 0,
        });
      }),
    );
  }
}
