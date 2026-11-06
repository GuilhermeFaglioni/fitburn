/** Período máximo de uma exportação CSV, em dias de calendário (inclusive nas duas pontas). */
export const EXPORT_PERIOD_MAX_DAYS = 92;

/** Cabeçalhos do CSV de ocupação, nesta ordem. Agregado por ocorrência: sem dado pessoal. */
export const OCCUPANCY_EXPORT_COLUMNS = [
  "ocorrencia_id",
  "aula",
  "data_local",
  "hora_local",
  "situacao",
  "capacidade",
  "vagas_ocupadas",
  "vagas_disponiveis",
  "ocupacao_percentual",
] as const;

/**
 * Cabeçalhos do CSV de reservas agregadas, nesta ordem. Uma linha por ocorrência;
 * as colunas de estado contam reservas. Agregado: sem dado pessoal nem ID de reserva.
 */
export const RESERVATIONS_EXPORT_COLUMNS = [
  "ocorrencia_id",
  "aula",
  "data_local",
  "hora_local",
  "situacao",
  "confirmadas",
  "canceladas",
  "concluidas",
  "nao_compareceu",
  "vagas_ocupadas",
] as const;

/**
 * Cabeçalhos do CSV de presenças agregadas, nesta ordem. Uma linha por ocorrência;
 * as colunas de estado contam reservas pelo status atual. Agregado: sem dado pessoal
 * nem ID de reserva.
 */
export const ATTENDANCE_EXPORT_COLUMNS = [
  "ocorrencia_id",
  "aula",
  "data_local",
  "hora_local",
  "situacao",
  "presentes",
  "faltas",
  "pendentes",
] as const;
