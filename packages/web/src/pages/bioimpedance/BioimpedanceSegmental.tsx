import {
  MEASURE_RATING_LABELS,
  type BioimpedanceAssessment,
  type MeasureRatingName,
} from "@fitburn/contracts";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Segmented";
import {
  SEGMENT_KINDS,
  SEGMENT_REGIONS,
  segmentKey,
  type SegmentKind,
} from "../../lib/bioimpedance/evolution";
import { formatNumber, ratingOf, variation } from "../../lib/bioimpedance/summary";
import { VariationText, formatDate } from "./bioimpedanceParts";

const RATING_TONE: Record<MeasureRatingName, BadgeTone> = {
  BELOW: "warn",
  NORMAL: "ok",
  ABOVE: "err",
};

/**
 * Segmentar (`?aba=segmentar&tipo=gordura`): massa magra ou gordura por região, com kg, % em relação ao ideal,
 * avaliação do laudo e variação desde a avaliação anterior (#198).
 */
export function Segmental({
  assessment,
  previous,
  kind,
  onKind,
}: {
  assessment: BioimpedanceAssessment;
  previous: BioimpedanceAssessment | undefined;
  kind: SegmentKind;
  onKind: (kind: SegmentKind) => void;
}) {
  const regions = SEGMENT_REGIONS.flatMap((region) => {
    const key = segmentKey(kind, region.suffix);
    const measure = assessment.measures[key];
    return measure ? [{ ...region, key, measure }] : [];
  });
  const changes = regions.flatMap((region) => {
    const change = variation(region.key, assessment, previous);
    return change ? [{ ...region, change }] : [];
  });

  return (
    <>
      <Segmented label="Tipo" options={SEGMENT_KINDS} value={kind} onChange={onKind} />
      {regions.length === 0 ? (
        <Card as="section" flat className="fb-bio__card">
          <p className="fb-bio__copy">
            Esta avaliação não traz {kind === "lean" ? "a massa magra" : "a gordura"} por região do
            corpo.
          </p>
        </Card>
      ) : (
        <>
          <ul
            className="fb-bio-body"
            aria-label={kind === "lean" ? "Massa magra por região" : "Gordura por região"}
          >
            {regions.map(({ suffix, label, measure }) => {
              const rating = ratingOf(measure);
              return (
                <li key={suffix} className={`fb-bio-seg fb-bio-seg--${suffix}`}>
                  <span className="fb-bio__copy">{label}</span>
                  <strong>{formatNumber(measure.value)} kg</strong>
                  {measure.percent !== undefined && (
                    <span>{formatNumber(measure.percent, 1)}%</span>
                  )}
                  {rating && (
                    <Badge tone={RATING_TONE[rating]}>{MEASURE_RATING_LABELS[rating]}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="fb-bio__copy">
            Esquerdo e direito do ponto de vista do corpo, como no laudo. O % é em relação ao ideal
            para o seu peso.
            {kind === "fat" && " A gordura por região é estimada pelo equipamento."}
          </p>
          {previous && changes.length > 0 ? (
            <Card as="section" flat className="fb-bio__card" aria-labelledby="fb-bio-seg-since">
              <h2 id="fb-bio-seg-since" className="fb-bio__subtitle">
                Desde {formatDate(previous.measuredAt)}
              </h2>
              <dl className="fb-bio-control">
                {changes.map(({ suffix, label, key, change }) => (
                  <div key={suffix}>
                    <dt>{label}</dt>
                    <dd>
                      <VariationText metricKey={key} change={change} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : (
            !previous && (
              <p className="fb-bio__copy">A variação aparece a partir da segunda avaliação.</p>
            )
          )}
        </>
      )}
    </>
  );
}
