import { useState } from "react";
import { availabilityLevel, AvailabilityLevel, type ClientAgendaItem } from "@fitburn/contracts";
import { formatHour, formatInstantHour } from "../../lib/agenda/format";
import { occupancyRatio, type HourGroup as HourGroupData } from "../../lib/agenda/group-by-hour";
import { firstName } from "../../lib/names";
import { Badge, type BadgeTone } from "../../components/ui/Badge";

/** Selo de vagas da aula (o texto diz o nível; a cor é só reforço). */
function classBadge(item: ClientAgendaItem): { tone: BadgeTone; text: string } {
  const ratio = `${item.available}/${item.capacity}`;
  switch (availabilityLevel(item.available, item.capacity)) {
    case AvailabilityLevel.FULL:
      return { tone: "err", text: `${ratio} vagas · lotada` };
    case AvailabilityLevel.ALMOST_FULL:
      return { tone: "warn", text: `${ratio} vagas · quase lotada` };
    default:
      return { tone: "brand", text: `${ratio} vagas` };
  }
}

/** "06h" para hora cheia; "06h30" quando a aula começa fora da hora cheia. */
function groupHour(time: string): string {
  return time.endsWith(":00") ? `${time.slice(0, 2)}h` : formatHour(time);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Selo do grupo fechado; "Você reservou" vence "Poucas vagas" e "Lotado". Aberto sem reserva fica sem selo. */
function groupBadge(group: HourGroupData): { tone: BadgeTone; text: string; dot?: boolean } | null {
  if (group.mine) return { tone: "ok", text: "Você reservou", dot: true };
  if (group.status === "low") return { tone: "warn", text: "Poucas vagas" };
  if (group.status === "full") return { tone: "err", text: "Lotado" };
  return null;
}

export interface HourGroupProps {
  group: HourGroupData;
  onOpenClass: (item: ClientAgendaItem) => void;
}

/**
 * Horário da agenda "Todas" (issue 189, D-043): fechado resume o horário (aulas, modalidades, vagas somadas, ocupação);
 * aberto lista cada aula, que abre o detalhe. O grupo com reserva do cliente já nasce aberto; depois disso o
 * estado aberto/fechado é do usuário e não é sobrescrito pelos re-renders.
 */
export function HourGroup({ group, onOpenClass }: HourGroupProps) {
  const [open, setOpen] = useState(group.mine);
  const badge = groupBadge(group);
  const [only] = group.items;
  const summaryText =
    group.classCount === 1 && only
      ? `${only.modality.name}${only.instructor ? ` · Prof. ${firstName(only.instructor.fullName)}` : ""}`
      : group.modalities.join(", ");
  const ratio = Math.round(occupancyRatio(group) * 100);

  return (
    <details
      className={`fb-hgroup${group.mine ? " fb-hgroup--mine" : ""}${group.status === "full" ? " fb-hgroup--full" : ""}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="fb-hgroup__summary">
        <span className="fb-hgroup__time">
          {groupHour(group.time)}
          <small>{group.period}</small>
        </span>
        <span className="fb-hgroup__meta">
          <b>{plural(group.classCount, "aula", "aulas")}</b>
          <span>{summaryText}</span>
        </span>
        <span className="fb-hgroup__end">
          <span className="fb-hgroup__spots">
            {group.available === 1 ? "1 vaga" : `${group.available} vagas`} <small>de {group.capacity}</small>
          </span>
          <span className="fb-hgroup__bar" aria-hidden="true">
            <i style={{ width: `${ratio}%` }} />
          </span>
          {badge && (
            <Badge tone={badge.tone} dot={badge.dot}>
              {badge.text}
            </Badge>
          )}
        </span>
      </summary>
      <ul className="fb-hgroup__list">
        {group.items.map((item) => {
          const mine = Boolean(item.myReservationId);
          const availability = classBadge(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`fb-hclass${mine ? " fb-hclass--mine" : ""}`}
                onClick={() => onOpenClass(item)}
              >
                <span className="fb-hclass__meta">
                  <b>{item.modality.name}</b>
                  <span>
                    {/* Nome acessível com modalidade e horário; no layout o horário já está no cabeçalho do grupo. */}
                    <span className="fb-ui-sr-only">{formatInstantHour(item.startsAt)} · </span>
                    {item.instructor ? `Prof. ${firstName(item.instructor.fullName)} · ` : ""}
                    {item.durationMinutes} min
                  </span>
                </span>
                {mine ? (
                  <Badge tone="ok" dot>
                    Reservada
                  </Badge>
                ) : (
                  <Badge tone={availability.tone}>{availability.text}</Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
