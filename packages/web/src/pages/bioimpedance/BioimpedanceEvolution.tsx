import { useMemo } from "react";
import type { BioimpedanceAssessment } from "@fitburn/contracts";
import { LineChart } from "../../components/LineChart";
import { Card } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Segmented";
import { Select } from "../../components/ui/Select";
import {
  EVOLUTION_MEASURES,
  EVOLUTION_PERIODS,
  evolutionPoints,
  measureFullLabel,
  type EvolutionPeriod,
} from "../../lib/bioimpedance/evolution";
import { formatNumber, variationBetween } from "../../lib/bioimpedance/summary";
import type { MeasureDefinition } from "@fitburn/contracts";
import { VariationText, formatDate } from "./bioimpedanceParts";

function withUnit(definition: MeasureDefinition, value: number): string {
  return `${formatNumber(value)}${definition.unit ? ` ${definition.unit}` : ""}`;
}

/** Evolução (`?aba=evolucao`): uma medida por vez, período, primeira × atual e valores por data (#198). */
export function Evolution({
  items,
  definition,
  period,
  onMeasure,
  onPeriod,
  now,
}: {
  items: readonly BioimpedanceAssessment[];
  definition: MeasureDefinition;
  period: EvolutionPeriod;
  onMeasure: (key: string) => void;
  onPeriod: (period: EvolutionPeriod) => void;
  now: Date;
}) {
  const points = useMemo(
    () => evolutionPoints(items, definition.key, period, now),
    [items, definition.key, period, now],
  );
  const latest = points[points.length - 1];
  const earliest = points[0];
  const band =
    latest?.rangeMin !== undefined && latest.rangeMax !== undefined
      ? { min: latest.rangeMin, max: latest.rangeMax }
      : null;

  return (
    <>
      <Select
        label="Medida"
        value={definition.key}
        onChange={(event) => onMeasure(event.target.value)}
      >
        {EVOLUTION_MEASURES.map((measure) => (
          <option key={measure.key} value={measure.key}>
            {measureFullLabel(measure)}
            {measure.unit ? ` (${measure.unit})` : ""}
          </option>
        ))}
      </Select>
      <Segmented label="Período" options={EVOLUTION_PERIODS} value={period} onChange={onPeriod} />

      {points.length === 0 ? (
        <Card as="section" flat className="fb-bio__card">
          <p className="fb-bio__copy">
            {measureFullLabel(definition)} não tem registro{" "}
            {period === "all" ? "nas suas avaliações" : "neste período"}.
          </p>
        </Card>
      ) : (
        <>
          {points.length === 1 && (
            <p className="fb-bio__copy">
              Só há um registro de {measureFullLabel(definition).toLowerCase()}. A linha aparece a
              partir do segundo.
            </p>
          )}
          <Card
            as="section"
            flat
            className="fb-bio__card"
            aria-label={`Evolução de ${measureFullLabel(definition)}`}
          >
            <LineChart
              label={`Evolução de ${measureFullLabel(definition)}`}
              points={points.map((point) => ({
                id: point.id,
                at: point.measuredAt,
                value: point.value,
                dateLabel: formatDate(point.measuredAt),
                valueLabel: withUnit(definition, point.value),
              }))}
              band={band}
              bandLabel={
                band
                  ? `Faixa normal: ${formatNumber(band.min)}–${formatNumber(band.max)}`
                  : undefined
              }
              valueHeader={measureFullLabel(definition)}
              formatAxis={(value) => formatNumber(value, 1)}
            />
          </Card>
          {points.length > 1 && earliest && latest && (
            <dl className="fb-bio-first-last">
              <div>
                <dt>Primeira ({formatDate(earliest.measuredAt)})</dt>
                <dd>{withUnit(definition, earliest.value)}</dd>
              </div>
              <div>
                <dt>Atual ({formatDate(latest.measuredAt)})</dt>
                <dd>
                  {withUnit(definition, latest.value)}{" "}
                  <VariationText
                    metricKey={definition.key}
                    change={variationBetween(definition.key, latest.value, earliest.value)}
                  />
                </dd>
              </div>
            </dl>
          )}
        </>
      )}
    </>
  );
}
