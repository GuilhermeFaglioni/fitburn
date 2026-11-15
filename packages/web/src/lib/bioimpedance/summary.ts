import {
  BIOIMPEDANCE_GROUP_LABELS,
  BIOIMPEDANCE_GROUP_ORDER,
  MeasureRating,
  measureDefinition,
  measuresOfGroup,
  type BioimpedanceAssessment,
  type BioimpedanceGroupName,
  type MeasureDefinition,
  type MeasureRatingName,
  type MeasureValue,
} from "@fitburn/contracts";

/** As 6 métricas do Resumo, na ordem da proposta aprovada. */
export const SUMMARY_METRIC_KEYS = [
  "weight",
  "skeletalMuscleMass",
  "bodyFatPercent",
  "bodyFatMass",
  "bmi",
  "visceralFatLevel",
] as const;

export const WEIGHT_CONTROL_KEYS = [
  "targetWeight",
  "weightControl",
  "fatControl",
  "muscleControl",
] as const;

/** Mais recente primeiro. */
export function sortAssessments(
  items: readonly BioimpedanceAssessment[],
): BioimpedanceAssessment[] {
  return [...items].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

/** A avaliação imediatamente anterior à escolhida (a lista vem da mais recente para a mais antiga). */
export function previousOf(
  sorted: readonly BioimpedanceAssessment[],
  selected: BioimpedanceAssessment,
): BioimpedanceAssessment | undefined {
  const index = sorted.findIndex((item) => item.id === selected.id);
  return index >= 0 ? sorted[index + 1] : undefined;
}

export type Trend = "up" | "down" | "same";

export interface Variation {
  trend: Trend;
  /** Valor absoluto da diferença, já arredondado para exibição. */
  amount: number;
}

function decimalsOf(definition: MeasureDefinition): number {
  if (definition.group === "SEGMENTAL_LEAN" || definition.group === "SEGMENTAL_FAT") return 2;
  return definition.unit === "" && definition.key === "visceralFatLevel" ? 0 : 1;
}

/** Diferença entre dois valores de uma medida; `null` quando falta algum. */
export function variationBetween(
  key: string,
  now: number | undefined,
  before: number | undefined,
): Variation | null {
  const definition = measureDefinition(key);
  if (!definition || now === undefined || before === undefined) return null;
  const factor = 10 ** decimalsOf(definition);
  const diff = Math.round((now - before) * factor) / factor;
  if (diff === 0) return { trend: "same", amount: 0 };
  return { trend: diff > 0 ? "up" : "down", amount: Math.abs(diff) };
}

/** Diferença entre duas avaliações para uma medida; `null` quando falta o valor em uma das duas. */
export function variation(
  key: string,
  current: BioimpedanceAssessment,
  previous: BioimpedanceAssessment | undefined,
): Variation | null {
  return variationBetween(key, current.measures[key]?.value, previous?.measures[key]?.value);
}

/** Número no padrão brasileiro: vírgula decimal, sem zeros sobrando. */
export function formatNumber(value: number, decimals?: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  });
}

export function formatMeasure(key: string, measure: MeasureValue | undefined): string {
  const definition = measureDefinition(key);
  if (!definition || !measure) return "—";
  const unit = definition.unit ? ` ${definition.unit}` : "";
  return `${formatNumber(measure.value)}${unit}`;
}

/** Faixa do laudo ("37–45,2") ou `null` quando a medida não traz faixa. */
export function formatRange(measure: MeasureValue | undefined): string | null {
  if (measure?.rangeMin === undefined || measure.rangeMax === undefined) return null;
  return `${formatNumber(measure.rangeMin)}–${formatNumber(measure.rangeMax)}`;
}

/** Abaixo, Normal ou Acima: a classificação do laudo, ou a posição do valor na faixa. */
export function ratingOf(measure: MeasureValue): MeasureRatingName | null {
  if (measure.rating) return measure.rating;
  if (measure.rangeMin === undefined || measure.rangeMax === undefined) return null;
  if (measure.value < measure.rangeMin) return MeasureRating.BELOW;
  if (measure.value > measure.rangeMax) return MeasureRating.ABOVE;
  return MeasureRating.NORMAL;
}

/**
 * Posição do marcador (0 a 100) numa barra em três terços: Abaixo, Normal e Acima. A faixa normal ocupa o terço do
 * meio; fora dela o marcador anda até a ponta, sem sair da barra. Sem faixa, usa a classificação.
 */
export function markerPosition(measure: MeasureValue): number | null {
  const rating = ratingOf(measure);
  if (rating === null) return null;
  const { rangeMin, rangeMax, value } = measure;
  if (rangeMin !== undefined && rangeMax !== undefined && rangeMax > rangeMin) {
    const width = rangeMax - rangeMin;
    const position = 100 / 3 + ((value - rangeMin) / width) * (100 / 3);
    return Math.min(96, Math.max(4, position));
  }
  return rating === MeasureRating.BELOW ? 16 : rating === MeasureRating.ABOVE ? 84 : 50;
}

export interface ValueGroup {
  group: BioimpedanceGroupName;
  label: string;
  rows: { definition: MeasureDefinition; measure: MeasureValue }[];
}

/** Grupos do laudo com as medidas presentes na avaliação, na ordem do catálogo; grupos sem medida saem. */
export function valueGroups(assessment: BioimpedanceAssessment): ValueGroup[] {
  return BIOIMPEDANCE_GROUP_ORDER.filter((group) => group !== "SCORE")
    .map((group) => ({
      group,
      label: BIOIMPEDANCE_GROUP_LABELS[group],
      rows: measuresOfGroup(group).flatMap((definition) => {
        const measure = assessment.measures[definition.key];
        return measure ? [{ definition, measure }] : [];
      }),
    }))
    .filter((entry) => entry.rows.length > 0);
}
