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
