import { Injectable } from "@nestjs/common";
import {
  ATTENDANCE_EXPORT_COLUMNS,
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

/** Dados de uma ocorrência e as contagens de presença por estado (sem nada de cliente ou professor). */
export interface AttendanceRecord {
  id: string;
  name: string;
  startsAt: Date;
  status: OccurrenceStatusName;
  /** Reservas COMPLETED: presente. */
  present: number;
  /** Reservas NO_SHOW: faltou. */
  absent: number;
  /** Reservas CONFIRMED: ainda sem registro. Nunca é falta. */
  pending: number;
}

/**
 * Linha do CSV de presenças. Função pura: a regra fica aqui e não no serviço de
 * consulta. Cancelamento não é ausência: reservas CANCELLED não entram em
 * nenhuma coluna, e pendente não vira falta.
 */
export function attendanceCsvRow(record: AttendanceRecord): CsvCell[] {
  const { date, time } = utcToGymDateTime(record.startsAt);
  return [
    record.id,
    record.name,
    date,
    time,
    record.status === OccurrenceStatus.CANCELLED ? "CANCELADA" : "AGENDADA",
    record.present,
    record.absent,
    record.pending,
  ];
}

@Injectable()
export class AttendanceExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CSV de presenças agregadas por ocorrência do período (inclusive canceladas e
   * sem reservas). O escopo vale para as duas leituras, então as contagens
   * vêm só das aulas que a pessoa enxerga.
   */
  async buildCsv(period: ExportPeriod, requester: ScopedRequester): Promise<string> {
    const occurrenceWhere = {
      startsAt: { gte: period.startsAtGte, lt: period.startsAtLt },
      ...occurrenceScopeFilter(requester),
    };
    // Duas leituras, sem N+1: as ocorrências (sem take/skip) e as reservas vivas
    // agrupadas por ocorrência e estado, restritas às mesmas ocorrências do escopo.
    const [occurrences, groups] = await Promise.all([
      this.prisma.classOccurrence.findMany({
        where: occurrenceWhere,
        select: { id: true, name: true, startsAt: true, status: true },
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.reservation.groupBy({
        by: ["occurrenceId", "status"],
        where: {
          occurrence: occurrenceWhere,
          status: { not: ReservationStatus.CANCELLED },
        },
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
      ATTENDANCE_EXPORT_COLUMNS,
      occurrences.map((occurrence) => {
        const byStatus = countsByOccurrence.get(occurrence.id);
        return attendanceCsvRow({
          id: occurrence.id,
          name: occurrence.name,
          startsAt: occurrence.startsAt,
          status: occurrence.status,
          present: byStatus?.get(ReservationStatus.COMPLETED) ?? 0,
          absent: byStatus?.get(ReservationStatus.NO_SHOW) ?? 0,
          pending: byStatus?.get(ReservationStatus.CONFIRMED) ?? 0,
        });
      }),
    );
  }
}
