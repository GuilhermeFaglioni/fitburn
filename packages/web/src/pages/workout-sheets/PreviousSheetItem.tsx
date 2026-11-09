import { Link, type LinkProps } from "react-router-dom";
import { WorkoutSheetStatus, type WorkoutSheet } from "@fitburn/contracts";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { formatInstantDate } from "../../lib/agenda/format";
import { firstName } from "../../lib/names";
import { STATUS_TONE, statusBadge } from "./status";

function exerciseCount(count: number): string {
  return count === 1 ? "1 exercício" : `${count} exercícios`;
}

/**
 * Uma ficha anterior (concluída ou arquivada) na lista "Fichas anteriores": nome, professor, quantidade de
 * exercícios, data e status. O card inteiro é o alvo do link (o nome é o link; a área vem do `::after`), então o
 * nome acessível é o da ficha e o toque tem bem mais que 44px.
 */
export function PreviousSheetItem({
  sheet,
  to,
  state,
  replace,
}: {
  sheet: WorkoutSheet;
  to: LinkProps["to"];
  state?: LinkProps["state"];
  replace?: boolean;
}) {
  const archived = sheet.status === WorkoutSheetStatus.ARCHIVED;
  return (
    <Card
      as="div"
      flat
      className={`fb-workout__row${archived ? " fb-workout__row--archived" : ""}`}
    >
      <span className="fb-workout__row-text">
        <Link to={to} state={state} replace={replace} className="fb-workout__row-link">
          {sheet.title}
        </Link>
        <span className="fb-workout__row-meta">
          Prof. {firstName(sheet.authorName)} · {exerciseCount(sheet.exercises.length)}
        </span>
        <span className="fb-workout__row-meta">{formatInstantDate(sheet.createdAt)}</span>
      </span>
      <Badge tone={STATUS_TONE[sheet.status]}>{statusBadge(sheet.status)}</Badge>
    </Card>
  );
}
