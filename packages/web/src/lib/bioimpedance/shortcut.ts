import { utcToGymDateTime, type BioimpedanceAssessment } from "@fitburn/contracts";
import { evolutionPoints } from "./evolution";
import { formatNumber, variationBetween, type Trend } from "./summary";

/** Atalho Corpo do Início (N2, #201): as 4 medidas, na ordem da proposta "B · Atalhos deslizantes". */
interface ShortcutMetric {
  key: string;
  label: string;
  unit: string;
  /** Sufixo da variação ("pp" para pontos percentuais). */
  deltaUnit: string;
  /** Sentido que é bom para a pessoa; `null` quando não há um (o peso depende do objetivo). */
  goodTrend: Trend | null;
}

export const BODY_SHORTCUT_METRICS: readonly ShortcutMetric[] = [
  { key: "bodyFatPercent", label: "Gordura corporal (PGC)", unit: "%", deltaUnit: " pp", goodTrend: "down" },
  { key: "weight", label: "Peso", unit: "kg", deltaUnit: " kg", goodTrend: null },
  { key: "skeletalMuscleMass", label: "Massa muscular", unit: "kg", deltaUnit: " kg", goodTrend: "up" },
  { key: "inbodyScore", label: "Pontuação InBody", unit: "/100", deltaUnit: "", goodTrend: "up" },
];

/** Quantas avaliações a minilinha mostra (as mais recentes). */
export const SPARK_POINTS = 6;

export interface BodyShortcutDelta {
  trend: Trend;
  /** Valor absoluto da variação, já formatado ("0,9"), com a unidade ("0,9 kg"). */
  amount: string;
  /** Data da avaliação anterior, "03/07". */
  since: string;
  /** O sentido é o bom para a medida; a cor só reforça, o texto já diz subiu ou caiu. */
  good: boolean;
}

export interface BodyShortcutSlide {
  key: string;
  label: string;
  value: string;
  unit: string;
  /** `null` com uma só avaliação da medida. */
  delta: BodyShortcutDelta | null;
  /** Pontos da minilinha (viewBox 100×30) e o último ponto; `null` com menos de duas avaliações. */
  spark: { points: string; last: { x: number; y: number } } | null;
  /** Toque: a evolução já na medida mostrada. */
  to: string;
}

/** "03/07" a partir do instante da avaliação, no fuso da academia. */
export function formatShortDate(iso: string): string {
  const [, month, day] = utcToGymDateTime(iso).date.split("-");
  return `${day}/${month}`;
}

const SPARK_LEFT = 4;
const SPARK_RIGHT = 96;
const SPARK_TOP = 4;
const SPARK_BOTTOM = 26;

/** Minilinha de valores (do mais antigo ao mais recente) no espaço 100×30; sem variação, uma reta no meio. */
export function sparkline(values: readonly number[]): BodyShortcutSlide["spark"] {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const middle = (SPARK_TOP + SPARK_BOTTOM) / 2;
  const coordinates = values.map((value, index) => ({
    x: SPARK_LEFT + (index * (SPARK_RIGHT - SPARK_LEFT)) / (values.length - 1),
    y: max === min ? middle : SPARK_BOTTOM - ((value - min) / (max - min)) * (SPARK_BOTTOM - SPARK_TOP),
  }));
  return {
    points: coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
    last: coordinates[coordinates.length - 1]!,
  };
}

/**
 * Os slides do atalho Corpo: uma medida por slide, com o valor mais recente, a variação desde a avaliação anterior
 * que tem a medida e a minilinha das últimas avaliações. Medida que nenhuma avaliação trouxe fica de fora.
 */
export function buildBodyShortcutSlides(
  assessments: readonly BioimpedanceAssessment[],
  now: Date = new Date(),
): BodyShortcutSlide[] {
  return BODY_SHORTCUT_METRICS.flatMap((metric) => {
    const points = evolutionPoints(assessments, metric.key, "all", now);
    const latest = points[points.length - 1];
    if (!latest) return [];
    const before = points[points.length - 2];
    const change = before ? variationBetween(metric.key, latest.value, before.value) : null;
    return [
      {
        key: metric.key,
        label: metric.label,
        value: formatNumber(latest.value),
        unit: metric.unit,
        delta:
          before && change
            ? {
                trend: change.trend,
                amount: `${formatNumber(change.amount)}${metric.deltaUnit}`,
                since: formatShortDate(before.measuredAt),
                good: change.trend !== "same" && change.trend === metric.goodTrend,
              }
            : null,
        spark: sparkline(points.slice(-SPARK_POINTS).map((point) => point.value)),
        to: `/bioimpedancia?aba=evolucao&medida=${metric.key}`,
      },
    ];
  });
}
