import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  gymToday,
  startOfWeek,
  utcToGymDateTime,
  weekdayOf,
  type AttendanceClass,
} from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import { listAttendanceClasses } from "../lib/attendance/api";
import { formatDayHeading, formatInstantHour } from "../lib/agenda/format";

type Tab = "today" | "week";

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

type BadgeTone = "neutral" | "active" | "accent";

/** O que falta fazer na aula: pendentes de registro, ou o total de reservas se ela ainda não começou. */
function progressBadge(item: AttendanceClass): { tone: BadgeTone; label: string } {
  const pending = item.totalCount - item.registeredCount;
  if (item.totalCount === 0) return { tone: "neutral", label: "Sem reservas" };
  if (pending === 0) return { tone: "active", label: "Tudo registrado" };
  if (new Date(item.startsAt) > new Date()) {
    return { tone: "neutral", label: plural(item.totalCount, "reserva", "reservas") };
  }
  return { tone: "accent", label: plural(pending, "pendente", "pendentes") };
}

/** Professor da aula, só quando não é a própria pessoa (quem vê mais que as próprias aulas). */
function instructorNote(item: AttendanceClass, currentUserId: string | undefined): string | null {
  if (!item.instructor) return "Sem professor";
  return item.instructor.id === currentUserId ? null : `Prof. ${item.instructor.fullName}`;
}

function ClassCard({ item, currentUserId }: { item: AttendanceClass; currentUserId?: string }) {
  const badge = progressBadge(item);
  const details = [
    item.totalCount > 0 ? `${item.registeredCount} de ${item.totalCount} registrados` : null,
    instructorNote(item, currentUserId),
  ].filter((detail) => detail !== null);

  return (
    <Link className="fb-myclass" to={`/presenca/${item.id}`}>
      <span className="fb-myclass__hour">{formatInstantHour(item.startsAt)}</span>
      <span className="fb-myclass__info">
        <span className="fb-myclass__title">{item.name}</span>
        {details.length > 0 && <span className="fb-myclass__sub">{details.join(" · ")}</span>}
      </span>
      <span className={`fb-badge fb-badge--${badge.tone}`}>{badge.label}</span>
    </Link>
  );
}

/**
 * Minhas aulas: as aulas do dia e da semana em que a pessoa pode registrar
 * presença (as dela; quem tem escopo mais amplo vê as de todos). Cada aula
 * abre a tela de Presença. Não há artboard para esta tela no canvas: usa a
 * casca administrativa clara.
 */
export function MyClassesPage() {
  const { user } = useAuth();
  const today = gymToday();
  const [tab, setTab] = useState<Tab>("today");

  const from = tab === "today" ? today : startOfWeek(today);
  const to = tab === "today" ? today : addDays(from, 6);
  const classesQuery = useQuery({
    queryKey: ["attendance-classes", from, to],
    queryFn: () => listAttendanceClasses(from, to),
  });

  const byDay = new Map<string, AttendanceClass[]>();
  for (const item of classesQuery.data ?? []) {
    const { date } = utcToGymDateTime(item.startsAt);
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fb-page-eyebrow">Presença</span>
        <h1 className="fb-page-title">Minhas aulas</h1>
      </div>

      <div className="fb-tabs">
        <button
          type="button"
          className={`fb-tab-btn${tab === "today" ? " active" : ""}`}
          aria-pressed={tab === "today"}
          onClick={() => setTab("today")}
        >
          Hoje
        </button>
        <button
          type="button"
          className={`fb-tab-btn${tab === "week" ? " active" : ""}`}
          aria-pressed={tab === "week"}
          onClick={() => setTab("week")}
        >
          Semana
        </button>
      </div>

      {classesQuery.isError && <p role="alert">Não foi possível carregar as aulas.</p>}

      {classesQuery.isSuccess && byDay.size === 0 && (
        <p className="fb-note">
          {tab === "today" ? "Nenhuma aula hoje." : "Nenhuma aula nesta semana."}
        </p>
      )}

      {classesQuery.isSuccess && tab === "today" && byDay.size > 0 && (
        <ul className="fb-myclass-list">
          {(byDay.get(today) ?? []).map((item) => (
            <li key={item.id}>
              <ClassCard item={item} currentUserId={user?.id} />
            </li>
          ))}
        </ul>
      )}

      {classesQuery.isSuccess &&
        tab === "week" &&
        [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, items]) => (
            <section key={date} className="fb-myclass-day">
              <h2 className="fb-myclass-day__title">
                {formatDayHeading(date, weekdayOf(date), today)}
              </h2>
              <ul className="fb-myclass-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <ClassCard item={item} currentUserId={user?.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
    </div>
  );
}
