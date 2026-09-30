import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  AvailabilityLevel,
  availabilityLevel,
  gymToday,
  startOfWeek,
  utcToGymDateTime,
  weekdayOf,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { listClientAgenda } from "../lib/agenda/client-api";
import {
  formatDayHeading,
  formatDayLabel,
  formatHour,
  formatClassMoment,
  formatInstantHour,
  formatWeekRange,
  WEEKDAYS_SHORT,
} from "../lib/agenda/format";
import { ClassDetailSheet, type Rescheduling } from "./client/ClassDetailSheet";
import { ReservationHistory } from "./client/ReservationHistory";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { firstName } from "../lib/agenda/first-name";

type AgendaTab = "upcoming" | "history";

/** Controle "Próximas | Histórico" de AgendaMobile/AgendaDesktop.dc.html. */
const AGENDA_TABS: Array<{ value: AgendaTab; label: string }> = [
  { value: "upcoming", label: "Próximas" },
  { value: "history", label: "Histórico" },
];

function availabilityText(item: ClientAgendaItem, style: "card" | "chip"): string {
  const ratio = `${item.available}/${item.capacity}`;
  switch (availabilityLevel(item.available, item.capacity)) {
    case AvailabilityLevel.FULL:
      return style === "card" ? `${ratio} vagas · lotada` : `${ratio} · lotada`;
    case AvailabilityLevel.ALMOST_FULL:
      return style === "card" ? `${ratio} vagas · quase lotada` : `${ratio} · quase lotada`;
    default:
      return style === "card" ? `${ratio} vagas disponíveis` : `${ratio} vagas`;
  }
}

function InfoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className="fb-client-note__icon"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" />
      <path
        d="M8 7.2V11.2"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="5" r="0.9" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0, marginTop: 4 }}
      aria-hidden="true"
    >
      <path
        d="M6 3.5L11 8L6 12.5"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Navegação entre semanas. O design mostra só a semana atual, sem controle de semana:
 * os botões ficam onde o design tem espaço vazio (canto da grade no desktop, à direita
 * do título no mobile) e sem rótulo visível, para não alterar o layout.
 */
function WeekNav({
  variant,
  weekStart,
  onGo,
}: {
  variant: "corner" | "title";
  weekStart: string;
  onGo: (offset: number) => void;
}) {
  return (
    <div
      className={`fb-client-weeknav fb-client-weeknav--${variant}`}
      role="group"
      aria-label={`Semana de ${formatWeekRange(weekStart)}`}
    >
      <button
        type="button"
        className="fb-client-icon-btn"
        aria-label="Semana anterior"
        onClick={() => onGo(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="fb-client-icon-btn"
        aria-label="Próxima semana"
        onClick={() => onGo(1)}
      >
        ›
      </button>
    </div>
  );
}

export function ClientAgendaPage() {
  const today = gymToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [openItem, setOpenItem] = useState<ClientAgendaItem | null>(null);
  const [tab, setTab] = useState<AgendaTab>("upcoming");
  // A Home leva à agenda já em remarcação (state.rescheduling).
  // O state é consumido uma vez e limpo, para não reabrir a remarcação em back/reload.
  const location = useLocation();
  const navigate = useNavigate();
  const [rescheduling, setRescheduling] = useState<Rescheduling | null>(
    () => (location.state as { rescheduling?: Rescheduling } | null)?.rescheduling ?? null,
  );
  const hasRouteRescheduling =
    (location.state as { rescheduling?: Rescheduling } | null)?.rescheduling !== undefined;

  useEffect(() => {
    if (hasRouteRescheduling) navigate(location.pathname + location.search, { replace: true });
  }, [hasRouteRescheduling, navigate, location.pathname, location.search]);

  const weekEnd = addDays(weekStart, 6);
  const agendaQuery = useQuery({
    queryKey: ["client-agenda", weekStart],
    queryFn: () => listClientAgenda(weekStart, weekEnd),
  });

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const byDay = new Map<string, ClientAgendaItem[]>();
  const hours = new Set<string>();
  for (const item of agendaQuery.data ?? []) {
    const { date, time } = utcToGymDateTime(item.startsAt);
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
    hours.add(time);
  }
  const sortedHours = [...hours].sort();

  function goToWeek(offset: number) {
    const next = addDays(weekStart, offset * 7);
    setWeekStart(next);
    setSelectedDay(next === startOfWeek(today) ? today : next);
  }

  const dayItems = byDay.get(selectedDay) ?? [];

  return (
    <div className="fb-client-agenda">
      <div className="fb-client-header">
        <h1 className="fb-client-title">Agenda</h1>
        {tab === "upcoming" && <WeekNav variant="title" weekStart={weekStart} onGo={goToWeek} />}
        <div className="fb-client-header__controls">
          <div className="fb-client-tabs">
            {AGENDA_TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className="fb-client-tab-btn"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "history" ? (
        <ReservationHistory onOpenClass={setOpenItem} />
      ) : (
        <>
          {rescheduling && (
            <div
              className="fb-sheet-alert fb-sheet-alert--success fb-reschedule-banner"
              role="status"
            >
              <span>
                Remarcando {rescheduling.from.name} ({formatClassMoment(rescheduling.from.startsAt)}
                ). Escolha a nova aula na agenda.
              </span>
              <button
                type="button"
                className="fb-reschedule-banner__dismiss"
                onClick={() => setRescheduling(null)}
              >
                Desistir
              </button>
            </div>
          )}

          <div className="fb-client-note">
            <InfoIcon />
            <span>Disponibilidade sujeita a confirmação no momento da reserva.</span>
          </div>

          {agendaQuery.isLoading && <LoadingState surface="dark" />}
          {agendaQuery.isError && (
            <ErrorState
              surface="dark"
              message="Não foi possível carregar a agenda."
              onRetry={() => void agendaQuery.refetch()}
            />
          )}

          <section className="fb-client-mobile-only" aria-label="Aulas do dia">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="fb-client-days">
                {days.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="fb-daychip"
                    aria-label={formatDayLabel(date, weekdayOf(date))}
                    aria-pressed={date === selectedDay}
                    onClick={() => setSelectedDay(date)}
                  >
                    <span className="fb-daychip__weekday">{WEEKDAYS_SHORT[weekdayOf(date)]}</span>
                    <span className="fb-daychip__day">{Number(date.slice(8))}</span>
                  </button>
                ))}
              </div>

              {agendaQuery.data && dayItems.length === 0 && (
                <EmptyState surface="dark" message="Nenhuma aula agendada para este dia." />
              )}

              {dayItems.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
                    {formatDayHeading(selectedDay, weekdayOf(selectedDay), today)}
                  </span>
                  {dayItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="fb-class-card"
                      onClick={() => setOpenItem(item)}
                    >
                      <span className="fb-class-card__body">
                        <span className="fb-class-card__title">{item.modality.name}</span>
                        <span className="fb-class-card__time">
                          {formatInstantHour(item.startsAt)} – {formatInstantHour(item.endsAt)}
                          {item.instructor ? ` · Prof. ${firstName(item.instructor.fullName)}` : ""}
                        </span>
                        <span
                          className={`fb-class-card__availability fb-availability--${availabilityLevel(item.available, item.capacity)}`}
                        >
                          {availabilityText(item, "card")}
                        </span>
                        {item.myReservationId && (
                          <span className="fb-client-sr-only">RESERVADA</span>
                        )}
                      </span>
                      <ChevronIcon />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="fb-client-desktop-only" aria-label="Grade da semana">
            {agendaQuery.data && agendaQuery.data.length === 0 ? (
              <EmptyState surface="dark" message="Nenhuma aula agendada para esta semana." />
            ) : (
              <div className="fb-client-grid">
                <div className="fb-client-cell fb-client-cell--head fb-client-cell--corner">
                  <WeekNav variant="corner" weekStart={weekStart} onGo={goToWeek} />
                </div>
                {days.map((date) => (
                  <div
                    key={date}
                    className={`fb-client-cell fb-client-cell--head${date === today ? " fb-client-cell--today" : ""}`}
                  >
                    <span className="fb-client-cell__weekday">
                      {WEEKDAYS_SHORT[weekdayOf(date)]}
                    </span>
                    <span className="fb-client-cell__day">{Number(date.slice(8))}</span>
                  </div>
                ))}
                {sortedHours.map((hour) => (
                  <div key={hour} style={{ display: "contents" }}>
                    <div className="fb-client-cell">
                      <span className="fb-client-cell__hour">{formatHour(hour)}</span>
                    </div>
                    {days.map((date) => (
                      <div
                        key={date}
                        className={`fb-client-cell${date === today ? " fb-client-cell--today" : ""}`}
                      >
                        {(byDay.get(date) ?? [])
                          .filter((item) => utcToGymDateTime(item.startsAt).time === hour)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="fb-client-chip"
                              onClick={() => setOpenItem(item)}
                            >
                              <div className="fb-client-chip__title">{item.modality.name}</div>
                              <div
                                className={`fb-client-chip__sub fb-availability--${availabilityLevel(item.available, item.capacity)}`}
                              >
                                {availabilityText(item, "chip")}
                              </div>
                              {item.myReservationId && (
                                <div className="fb-client-sr-only">Reservada</div>
                              )}
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {openItem && (
        <ClassDetailSheet
          key={openItem.id}
          item={openItem}
          rescheduling={rescheduling}
          onStartRescheduling={(next) => {
            setRescheduling(next);
            setOpenItem(null);
            setTab("upcoming");
          }}
          onRescheduled={() => setRescheduling(null)}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
}
