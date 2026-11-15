import {
  BIOIMPEDANCE_GROUP_LABELS,
  BIOIMPEDANCE_MEASURES,
  measureDefinition,
  type BioimpedanceAssessment,
  type MeasureDefinition,
} from "@fitburn/contracts";

export type EvolutionPeriod = "6m" | "1y" | "all";

export const EVOLUTION_PERIODS: readonly { value: EvolutionPeriod; label: string }[] = [
  { value: "6m", label: "6 meses" },
  { value: "1y", label: "1 ano" },
  { value: "all", label: "Tudo" },
];

export const DEFAULT_EVOLUTION_MEASURE = "weight";

/** Todas as medidas numéricas do catálogo, na ordem do laudo. */
export const EVOLUTION_MEASURES: readonly MeasureDefinition[] = BIOIMPEDANCE_MEASURES;

/** A medida da URL (`?medida=`), ou o peso quando ausente ou desconhecida. */
export function resolveMeasure(key: string | null): MeasureDefinition {
  return (
    (key ? measureDefinition(key) : undefined) ??
    (measureDefinition(DEFAULT_EVOLUTION_MEASURE) as MeasureDefinition)
  );
}

/** Nome completo da medida: segmentar e impedância levam o grupo na frente ("Massa magra segmentar · Tronco"). */
export function measureFullLabel(definition: MeasureDefinition): string {
  return definition.group === "SEGMENTAL_LEAN" || definition.group === "SEGMENTAL_FAT"
    ? `${BIOIMPEDANCE_GROUP_LABELS[definition.group]} · ${definition.label}`
    : definition.label;
}

export function resolvePeriod(value: string | null): EvolutionPeriod {
  return value === "6m" || value === "1y" ? value : "all";
}

export interface EvolutionPoint {
  id: string;
  measuredAt: string;
  value: number;
  rangeMin?: number;
  rangeMax?: number;
}

/** Início do período (UTC, meses corridos a partir de `now`); `null` para "Tudo". */
export function periodStart(period: EvolutionPeriod, now: Date): Date | null {
  if (period === "all") return null;
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - (period === "6m" ? 6 : 12));
  return start;
}

/** Pontos da medida dentro do período, do mais antigo para o mais recente. Avaliações sem a medida ficam de fora. */
export function evolutionPoints(
  items: readonly BioimpedanceAssessment[],
  key: string,
  period: EvolutionPeriod,
  now: Date,
): EvolutionPoint[] {
  const start = periodStart(period, now);
  return items
    .filter((item) => item.measures[key] !== undefined)
    .filter((item) => start === null || new Date(item.measuredAt).getTime() >= start.getTime())
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map((item) => {
      const measure = item.measures[key]!;
      return {
        id: item.id,
        measuredAt: item.measuredAt,
        value: measure.value,
        rangeMin: measure.rangeMin,
        rangeMax: measure.rangeMax,
      };
    });
}

/** Segmentar: as 5 regiões, na ordem do mapa do corpo (braços, tronco, pernas). */
export const SEGMENT_REGIONS = [
  { suffix: "LeftArm", label: "Braço esquerdo" },
  { suffix: "RightArm", label: "Braço direito" },
  { suffix: "Trunk", label: "Tronco" },
  { suffix: "LeftLeg", label: "Perna esquerda" },
  { suffix: "RightLeg", label: "Perna direita" },
] as const;

export type SegmentKind = "lean" | "fat";

export const SEGMENT_KINDS: readonly { value: SegmentKind; label: string }[] = [
  { value: "lean", label: "Massa magra" },
  { value: "fat", label: "Gordura" },
];

export function resolveSegmentKind(value: string | null): SegmentKind {
  return value === "gordura" ? "fat" : "lean";
}

export function segmentKey(kind: SegmentKind, suffix: string): string {
  return `${kind}${suffix}`;
}
