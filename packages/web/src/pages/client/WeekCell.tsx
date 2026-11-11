import { useState } from "react";
import { type ClientAgendaItem } from "@fitburn/contracts";
import { formatHour, formatWeekdayAndDay } from "../../lib/agenda/format";
import type { HourGroup } from "../../lib/agenda/group-by-hour";
import { Badge } from "../../components/ui/Badge";

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "18h" para hora cheia; "18h30" fora dela (mesmo texto do grupo do celular). */
function hourLabel(time: string): string {
  return time.endsWith(":00") ? `${time.slice(0, 2)}h` : formatHour(time);
}

export interface WeekCellProps {
  group: HourGroup;
  weekday: number;
  onOpenClass: (item: ClientAgendaItem) => void;
}

/**
 * Célula (dia × horário) da grade do desktop (issue 189, D-043): fechada resume o horário (aulas e vagas somadas);
 * aberta lista as aulas dentro da própria célula. Célula com reserva do cliente nasce aberta; depois o estado é
 * do usuário. O estado vive na célula, então some junto com ela quando a semana ou o filtro a tira da grade.
 */
export function WeekCell({ group, weekday, onOpenClass }: WeekCellProps) {
  const [open, setOpen] = useState(group.mine);
  const full = group.status === "full";
  const spots = full
    ? "Lotado"
    : `${group.available} de ${group.capacity} vagas`;
  const label =
    `${hourLabel(group.time)}, ${formatWeekdayAndDay(group.date, weekday)}: ` +
    `${plural(group.classCount, "aula", "aulas")}, ${full ? "lotado" : spots}` +
    (group.mine ? ", você reservou" : group.status === "low" ? ", poucas vagas" : "");

  return (
    <div className="fb-wkcell">
      <button
        type="button"
        className={`fb-wkblock${group.mine ? " fb-wkblock--mine" : ""}${full ? " fb-wkblock--full" : ""}`}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <b>
          {plural(group.classCount, "aula", "aulas")}
          <span aria-hidden="true"> {open ? "▴" : "▾"}</span>
        </b>
        <span className="fb-wkblock__spots">{spots}</span>
        {group.mine ? (
          <Badge tone="ok" dot>
            Você reservou
          </Badge>
        ) : group.status === "low" ? (
          <Badge tone="warn">Poucas vagas</Badge>
        ) : null}
      </button>
      {open &&
        group.items.map((item) => {
          const mine = Boolean(item.myReservationId);
          return (
            <button
              key={item.id}
              type="button"
              className={`fb-wkblock fb-wkblock--class${mine ? " fb-wkblock--mine" : ""}`}
              onClick={() => onOpenClass(item)}
            >
              <b>{item.modality.name}</b>
              <span className="fb-wkblock__spots">
                {mine ? "Reservada" : item.available === 1 ? "1 vaga" : `${item.available} vagas`}
              </span>
            </button>
          );
        })}
    </div>
  );
}
