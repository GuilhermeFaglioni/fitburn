import { useState } from "react";
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
  formatInstantHour,
  formatWeekRange,
  WEEKDAYS_SHORT,
} from "../lib/agenda/format";
import { ClassDetailSheet } from "./client/ClassDetailSheet";

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
      style={{ flexShrink: 0, marginTop: 1 }}
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

export function ClientAgendaPage() {
  const today = gymToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [openItem, setOpenItem] = useState<ClientAgendaItem | null>(null);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 className="fb-client-title">Agenda</h1>
        <div className="fb-client-week">
          <button
            type="button"
            className="fb-client-icon-btn"
            aria-label="Semana anterior"
            onClick={() => goToWeek(-1)}
          >
            ‹
          </button>
          <span>{formatWeekRange(weekStart)}</span>
          <button
            type="button"
            className="fb-client-icon-btn"
            aria-label="Próxima semana"
            onClick={() => goToWeek(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div className="fb-client-note">
        <InfoIcon />
        <span>Disponibilidade sujeita a confirmação no momento da reserva.</span>
      </div>

      {agendaQuery.isError && <p role="alert">Não foi possível carregar a agenda.</p>}

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
            <div className="fb-client-empty">Nenhuma aula agendada para este dia.</div>
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
                      {item.instructor ? ` · Prof. ${item.instructor.fullName}` : ""}
                    </span>
                    <span
                      className={`fb-class-card__availability fb-availability--${availabilityLevel(item.available, item.capacity)}`}
                    >
                      {availabilityText(item, "card")}
                    </span>
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
          <div className="fb-client-empty">Nenhuma aula agendada para esta semana.</div>
        ) : (
          <div className="fb-client-grid">
            <div className="fb-client-cell fb-client-cell--head" />
            {days.map((date) => (
              <div
                key={date}
                className={`fb-client-cell fb-client-cell--head${date === today ? " fb-client-cell--today" : ""}`}
              >
                <span className="fb-client-cell__weekday">{WEEKDAYS_SHORT[weekdayOf(date)]}</span>
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
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {openItem && (
        <ClassDetailSheet key={openItem.id} item={openItem} onClose={() => setOpenItem(null)} />
      )}
    </div>
  );
}
