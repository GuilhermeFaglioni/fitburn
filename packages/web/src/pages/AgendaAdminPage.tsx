import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  gymToday,
  Module,
  OccurrenceStatus,
  PermissionAction,
  startOfWeek,
  utcToGymDateTime,
  weekdayOf,
  type OccurrenceDetail,
} from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { useAuth } from "../lib/auth/AuthContext";
import { listOccurrences } from "../lib/agenda/api";
import { formatDayLabel, formatInstantHour, formatWeekRange } from "../lib/agenda/format";
import { OccurrenceFormModal } from "./agenda/OccurrenceFormModal";

type ModalState = { mode: "closed" } | { mode: "create"; date?: string };

function chipClass(occurrence: OccurrenceDetail): string {
  if (occurrence.status === OccurrenceStatus.CANCELLED) return "fb-chip-cls fb-chip-cls--cancelled";
  if (occurrence.bookedCount >= occurrence.capacity) return "fb-chip-cls fb-chip-cls--full";
  return "fb-chip-cls";
}

export function AgendaAdminPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const today = gymToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });

  const weekEnd = addDays(weekStart, 6);
  const occurrencesQuery = useQuery({
    queryKey: ["occurrences", weekStart],
    queryFn: () => listOccurrences(weekStart, weekEnd),
  });

  const canCreate = can(Module.OCORRENCIAS, PermissionAction.CREATE);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const occurrencesByDay = new Map<string, OccurrenceDetail[]>();
  for (const occurrence of occurrencesQuery.data ?? []) {
    const { date } = utcToGymDateTime(occurrence.startsAt);
    occurrencesByDay.set(date, [...(occurrencesByDay.get(date) ?? []), occurrence]);
  }

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["occurrences"] });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="fb-page-eyebrow">Agenda</span>
          <h1 className="fb-page-title">Ocorrências / agenda administrativa</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="fb-icon-btn"
            aria-label="Semana anterior"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            ‹
          </button>
          <span style={{ fontSize: 13, color: "#5a5a5a" }}>{formatWeekRange(weekStart)}</span>
          <button
            type="button"
            className="fb-icon-btn"
            aria-label="Próxima semana"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            ›
          </button>
          <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar aulas.">
            <button
              type="button"
              className="fb-btn-primary"
              onClick={() => setModal({ mode: "create" })}
            >
              + Nova aula
            </button>
          </BlockedAction>
        </div>
      </div>

      {occurrencesQuery.isError && <p role="alert">Não foi possível carregar a agenda.</p>}

      <div className="fb-week-grid">
        {days.map((date) => {
          const isToday = date === today;
          const label = isToday
            ? `HOJE ${Number(date.slice(8))}`
            : formatDayLabel(date, weekdayOf(date));
          return (
            <div key={date} className="fb-day-col">
              <div className={`fb-day-head${isToday ? " fb-day-head--today" : ""}`}>{label}</div>
              {(occurrencesByDay.get(date) ?? []).map((occurrence) => (
                <button key={occurrence.id} type="button" className={chipClass(occurrence)}>
                  <span className="fb-chip-cls__hour">
                    {formatInstantHour(occurrence.startsAt)}
                  </span>
                  <span className="fb-chip-cls__title">{occurrence.modality.name}</span>
                  <span className="fb-chip-cls__sub">
                    {occurrence.status === OccurrenceStatus.CANCELLED
                      ? "Cancelada"
                      : `${occurrence.instructor ? `Prof. ${occurrence.instructor.fullName}` : "Sem professor"} · ${occurrence.bookedCount}/${occurrence.capacity}`}
                  </span>
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  className="fb-day-empty"
                  aria-label={`Nova aula em ${formatDayLabel(date, weekdayOf(date))}`}
                  onClick={() => setModal({ mode: "create", date })}
                />
              )}
            </div>
          );
        })}
      </div>

      {modal.mode === "create" && (
        <OccurrenceFormModal
          initialDate={modal.date}
          onClose={() => setModal({ mode: "closed" })}
          onSaved={() => {
            setModal({ mode: "closed" });
            void refresh();
          }}
        />
      )}
    </div>
  );
}
