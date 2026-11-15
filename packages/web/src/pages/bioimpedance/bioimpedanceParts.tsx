import { measureDefinition } from "@fitburn/contracts";
import { formatNumber, type Variation } from "../../lib/bioimpedance/summary";
import { formatMeasuredAt } from "./BioimpedanceAdminPage";

export function formatDate(iso: string): string {
  return formatMeasuredAt(iso).split(" · ")[0];
}

/** "▼ 0,6 kg", com o sentido por extenso para leitores de tela. */
export function VariationText({
  metricKey,
  change,
}: {
  metricKey: string;
  change: Variation | null;
}) {
  if (!change) return <span className="fb-bio-metric__delta">—</span>;
  const unit = measureDefinition(metricKey)?.unit;
  const suffix = unit === "%" ? " pp" : unit === "kg" ? " kg" : "";
  if (change.trend === "same") {
    return <span className="fb-bio-metric__delta">igual</span>;
  }
  const arrow = change.trend === "up" ? "▲" : "▼";
  const words = change.trend === "up" ? "subiu" : "caiu";
  return (
    <span className="fb-bio-metric__delta">
      <span aria-hidden="true">{arrow} </span>
      <span className="fb-ui-sr-only">{words} </span>
      {formatNumber(change.amount)}
      {suffix}
    </span>
  );
}
