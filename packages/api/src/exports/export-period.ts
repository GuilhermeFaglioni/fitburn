import {
  addDays,
  daysBetween,
  EXPORT_PERIOD_MAX_DAYS,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";

export interface ExportPeriod {
  /** Data local inicial, inclusive ("YYYY-MM-DD", fuso da academia). */
  from: string;
  /** Data local final, inclusive ("YYYY-MM-DD", fuso da academia). */
  to: string;
  /** Início da janela em UTC: 00h00 de `from` na academia. */
  startsAtGte: Date;
  /** Fim exclusivo da janela em UTC: 00h00 do dia seguinte a `to` na academia. */
  startsAtLt: Date;
}

/**
 * Período de uma exportação, por data local da ocorrência. Assume datas já
 * validadas no formato "YYYY-MM-DD" (o controller valida com `dateRangeQuerySchema`).
 */
export function resolveExportPeriod(from: string, to: string): ExportPeriod {
  const days = daysBetween(from, to) + 1;
  if (days < 1) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      "A data inicial não pode ser posterior à data final.",
      ErrorStatus.VALIDATION,
    );
  }
  if (days > EXPORT_PERIOD_MAX_DAYS) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      `O período máximo da exportação é de ${EXPORT_PERIOD_MAX_DAYS} dias.`,
      ErrorStatus.VALIDATION,
    );
  }
  return {
    from,
    to,
    startsAtGte: gymDateTimeToUtc(from, "00:00"),
    startsAtLt: gymDateTimeToUtc(addDays(to, 1), "00:00"),
  };
}
