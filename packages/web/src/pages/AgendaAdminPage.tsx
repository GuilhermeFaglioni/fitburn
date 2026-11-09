import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ExportCsvButton } from "../components/ExportCsvButton";
import { QueryBlockState } from "../components/QueryBlockState";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Toolbar } from "../components/ui/Toolbar";
import { useAuth } from "../lib/auth/AuthContext";
import { isOwnClass } from "../lib/attendance/roster-access";
import { professorLabel } from "../lib/names";
import { exportOccupancyCsv, listOccurrences } from "../lib/agenda/api";
import {
  formatDayLabel,
  formatInstantHour,
  formatWeekRange,
  WEEKDAYS_SHORT,
} from "../lib/agenda/format";
import { OccurrenceEditModal } from "./agenda/OccurrenceEditModal";
import { OccurrenceFormModal } from "./agenda/OccurrenceFormModal";

type ModalState =
  | { mode: "closed" }
  | { mode: "create"; date?: string }
  | { mode: "edit"; occurrence: OccurrenceDetail };

/**
 * Agenda administrativa (D-038, #156): cabeçalho com as ações, navegação da semana (`Toolbar`) e a grade semanal de
 * aulas, com a ocupação em `Badge`. No celular a grade vira uma lista por dia. Criar e editar abrem `Dialog`.
 */
export function AgendaAdminPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
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

  // Se dois professores da semana compartilham o primeiro nome, a grade mostra o nome completo.
  const instructorNames = (occurrencesQuery.data ?? []).flatMap((occurrence) =>
    occurrence.instructor ? [occurrence.instructor.fullName] : [],
  );

  /**
   * O professor que clica na própria aula vai direto à lista de alunos; para os
   * demais (administração, aula de outro professor) abre-se o modal de edição,
   * que oferece "Ver alunos" quando a pessoa pode ver a presença daquela aula.
   */
  function open(occurrence: OccurrenceDetail) {
    const ownClass =
      occurrence.status === OccurrenceStatus.SCHEDULED &&
      isOwnClass(occurrence.instructor?.id, user?.id) &&
      can(Module.PRESENCA, PermissionAction.VIEW);
    if (ownClass) {
      navigate(`/presenca/${occurrence.id}`, { state: { from: "/agenda-administrativa" } });
    } else {
      setModal({ mode: "edit", occurrence });
    }
  }

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["occurrences"] });
  }

  const weekLabel = formatWeekRange(weekStart);

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Agenda"
        title="Ocorrências / agenda administrativa"
        actions={
          <>
            <ExportCsvButton
              label="Exportar ocupação (CSV)"
              onExport={() => exportOccupancyCsv(weekStart, weekEnd)}
            />
            <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar aulas.">
              <Button variant="primary" size="sm" onClick={() => setModal({ mode: "create" })}>
                + Nova aula
              </Button>
            </BlockedAction>
          </>
        }
      />

      <Toolbar className="fb-ui-weeknav" role="group" aria-label="Semana">
        <Button
          size="sm"
          className="fb-ui-btn--icon"
          aria-label="Semana anterior"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
        >
          ←
        </Button>
        <span role="status" className="fb-ui-weeknav__label">
          {weekLabel}
        </span>
        <Button
          size="sm"
          className="fb-ui-btn--icon"
          aria-label="Próxima semana"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
        >
          →
        </Button>
      </Toolbar>

      <QueryBlockState
        query={occurrencesQuery}
        hasData={occurrencesQuery.data !== undefined}
        loading="Carregando a agenda…"
        error="Não foi possível carregar a agenda."
      />

      <div
        role="region"
        aria-label={`Aulas da semana, ${weekLabel}`}
        tabIndex={0}
        className="fb-ui-wk-scroll"
      >
        <div className="fb-ui-wk">
          {days.map((date) => {
            const isToday = date === today;
            const weekday = weekdayOf(date);
            const dayOccurrences = occurrencesByDay.get(date) ?? [];
            const headingId = `agenda-day-${date}`;
            return (
              <section
                key={date}
                aria-labelledby={headingId}
                aria-current={isToday ? "date" : undefined}
                className={`fb-ui-wk__day${isToday ? " fb-ui-wk__day--today" : ""}`}
              >
                <h2 id={headingId} className="fb-ui-wk__head">
                  {WEEKDAYS_SHORT[weekday]} <b>{Number(date.slice(8))}</b>
                  {isToday && <span className="fb-ui-sr-only"> (hoje)</span>}
                </h2>
                {dayOccurrences.length > 0 ? (
                  <ul className="fb-ui-wk__list">
                    {dayOccurrences.map((occurrence) => {
                      const cancelled = occurrence.status === OccurrenceStatus.CANCELLED;
                      const full = occurrence.bookedCount >= occurrence.capacity;
                      return (
                        <li key={occurrence.id}>
                          <button
                            type="button"
                            className={`fb-ui-occ${cancelled ? " fb-ui-occ--cancelled" : ""}`}
                            onClick={() => open(occurrence)}
                          >
                            <span className="fb-ui-occ__hour">
                              {formatInstantHour(occurrence.startsAt)}
                            </span>{" "}
                            <span className="fb-ui-occ__title">{occurrence.modality.name}</span>{" "}
                            <span>
                              {cancelled
                                ? "Cancelada"
                                : occurrence.instructor
                                  ? professorLabel(occurrence.instructor.fullName, instructorNames)
                                  : "Sem professor"}
                            </span>
                            {!cancelled && (
                              <Fragment>
                                {" "}
                                <Badge tone={full ? "warn" : "neutral"}>
                                  {occurrence.bookedCount}/{occurrence.capacity}{" "}
                                  <span className="fb-ui-sr-only">
                                    {full ? "vagas ocupadas, lotada" : "vagas ocupadas"}
                                  </span>
                                </Badge>
                              </Fragment>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="fb-ui-wk__none">Sem aulas</p>
                )}
                {canCreate && (
                  <button
                    type="button"
                    className="fb-ui-wk__add"
                    aria-label={`Nova aula em ${formatDayLabel(date, weekday)}`}
                    onClick={() => setModal({ mode: "create", date })}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {modal.mode === "edit" && (
        <OccurrenceEditModal
          occurrence={modal.occurrence}
          onClose={() => setModal({ mode: "closed" })}
          onChanged={() => {
            setModal({ mode: "closed" });
            void refresh();
          }}
        />
      )}

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
