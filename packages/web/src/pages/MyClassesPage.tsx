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
import { exportAttendanceCsv, listAttendanceClasses } from "../lib/attendance/api";
import { formatDayHeading, formatInstantHour } from "../lib/agenda/format";
import { ExportCsvButton } from "../components/ExportCsvButton";
import { QueryBlockState } from "../components/QueryBlockState";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { EmptyState } from "../components/ui/States";

type Tab = "today" | "week";

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Semana" },
] as const;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

interface Progress {
  tone: BadgeTone;
  label: string;
  /** Ainda há presença a registrar: o botão da linha convida a registrar; senão, só a abrir. */
  pending: boolean;
}

/** O que falta fazer na aula: pendentes de registro, ou o total de reservas se ela ainda não começou. */
function progressOf(item: AttendanceClass): Progress {
  const pending = item.totalCount - item.registeredCount;
  if (item.totalCount === 0) return { tone: "neutral", label: "Sem reservas", pending: false };
  if (pending === 0) return { tone: "ok", label: "Tudo registrado", pending: false };
  if (new Date(item.startsAt) > new Date()) {
    return { tone: "neutral", label: plural(item.totalCount, "reserva", "reservas"), pending: false };
  }
  return { tone: "warn", label: plural(pending, "pendente", "pendentes"), pending: true };
}

/** Professor da aula, só quando não é a própria pessoa (quem vê mais que as próprias aulas). */
function instructorNote(item: AttendanceClass, currentUserId: string | undefined): string | null {
  if (!item.instructor) return "Sem professor";
  return item.instructor.id === currentUserId ? null : `Prof. ${item.instructor.fullName}`;
}

function ClassRow({ item, currentUserId }: { item: AttendanceClass; currentUserId?: string }) {
  const progress = progressOf(item);
  const hour = formatInstantHour(item.startsAt);
  const details = [
    item.totalCount > 0 ? `${item.registeredCount} de ${item.totalCount} registrados` : null,
    instructorNote(item, currentUserId),
  ].filter((detail) => detail !== null);
  const action = progress.pending ? "Registrar presença" : "Ver presença";

  return (
    <li className="fb-ui-mc">
      <span className="fb-ui-mc__time">{hour}</span>
      <div className="fb-ui-mc__meta">
        <b className="fb-ui-mc__title">{item.name}</b>
        {details.length > 0 && <span className="fb-ui-mc__sub">{details.join(" · ")}</span>}
      </div>
      <Badge tone={progress.tone} dot={progress.tone === "ok"}>
        {progress.label}
      </Badge>
      {/* O nome acessível começa com o texto visível e acrescenta de qual aula é (vários botões iguais na lista). */}
      <Link
        className="fb-ui-btn fb-ui-btn--soft fb-ui-btn--sm fb-ui-mc__action"
        to={`/presenca/${item.id}`}
        aria-label={`${action}: ${item.name}, ${hour}`}
      >
        {action}
      </Link>
    </li>
  );
}

/**
 * Minhas aulas: as aulas do dia e da semana em que a pessoa pode registrar
 * presença (as dela; quem tem escopo mais amplo vê as de todos). Cada aula
 * tem o botão que abre a tela de Presença. Tela extrapolada da base (#156,
 * D-038); o desenho é o de "Minhas aulas" do preview.
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
  const loaded = classesQuery.data !== undefined;

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Presença"
        title="Minhas aulas"
        actions={
          /* Exporta o mesmo período da lista (Hoje = o dia; Semana = segunda a domingo). */
          <ExportCsvButton
            label="Exportar presenças (CSV)"
            onExport={() => exportAttendanceCsv(from, to)}
          />
        }
      />

      <Segmented label="Período" options={PERIODS} value={tab} onChange={setTab} />

      <QueryBlockState
        query={classesQuery}
        hasData={loaded}
        loading="Carregando as aulas…"
        error="Não foi possível carregar as aulas."
      />

      {loaded && byDay.size === 0 && (
        <EmptyState title={tab === "today" ? "Nenhuma aula hoje." : "Nenhuma aula nesta semana."} />
      )}

      {loaded && tab === "today" && byDay.size > 0 && (
        <ul className="fb-ui-mc-list">
          {(byDay.get(today) ?? []).map((item) => (
            <ClassRow key={item.id} item={item} currentUserId={user?.id} />
          ))}
        </ul>
      )}

      {loaded &&
        tab === "week" &&
        [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, items]) => (
            <section key={date} className="fb-ui-mc-day">
              <h2 className="fb-ui-mc-day__title">
                {formatDayHeading(date, weekdayOf(date), today)}
              </h2>
              <ul className="fb-ui-mc-list">
                {items.map((item) => (
                  <ClassRow key={item.id} item={item} currentUserId={user?.id} />
                ))}
              </ul>
            </section>
          ))}
    </div>
  );
}
