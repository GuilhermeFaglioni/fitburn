import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ErrorCode,
  Module,
  OccurrenceStatus,
  PermissionAction,
  utcToGymDateTime,
  weekdayOf,
  type OccurrenceDetail,
} from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { ApiError } from "../../lib/auth/api";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  cancelOccurrence,
  deleteOccurrence,
  getOccurrenceFormOptions,
  updateOccurrence,
} from "../../lib/agenda/api";
import { formatInstantHour, formatShortDate } from "../../lib/agenda/format";
import { OccurrenceErrorBox } from "./OccurrenceErrorBox";

type View = "form" | "confirm-cancel" | "confirm-delete";

/** "Editar aula" e a confirmação de cancelamento de AgendaAdmin.dc.html. */
export function OccurrenceEditModal({
  occurrence,
  onClose,
  onChanged,
}: {
  occurrence: OccurrenceDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const formId = useId();
  const { can } = useAuth();
  const optionsQuery = useQuery({
    queryKey: ["occurrence-options"],
    queryFn: getOccurrenceFormOptions,
  });
  const local = utcToGymDateTime(occurrence.startsAt);
  const isCancelled = occurrence.status === OccurrenceStatus.CANCELLED;

  const [view, setView] = useState<View>("form");
  const [date, setDate] = useState(local.date);
  const [startTime, setStartTime] = useState(local.time);
  const [durationMinutes, setDurationMinutes] = useState(String(occurrence.durationMinutes));
  const [capacity, setCapacity] = useState(String(occurrence.capacity));
  const [instructorId, setInstructorId] = useState(occurrence.instructor?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // O professor atual continua selecionável mesmo que já não esteja ativo.
  const instructors = optionsQuery.data?.instructors ?? [];
  const current = occurrence.instructor;
  const instructorOptions =
    current && !instructors.some((instructor) => instructor.id === current.id)
      ? [...instructors, current]
      : instructors;

  const canEdit = can(Module.OCORRENCIAS, PermissionAction.EDIT);
  const canDelete = can(Module.OCORRENCIAS, PermissionAction.DELETE);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
      onChanged();
    } catch (caught) {
      // A aula mudou por fora (cancelada ou excluída): recarrega a agenda.
      if (
        caught instanceof ApiError &&
        (caught.code === ErrorCode.OCCURRENCE_CANCELLED || caught.code === ErrorCode.NOT_FOUND)
      ) {
        onChanged();
        return;
      }
      setError(caught);
      setView("form");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() =>
      updateOccurrence(occurrence.id, {
        date,
        startTime,
        durationMinutes: Number(durationMinutes),
        capacity: Number(capacity),
        instructorId: instructorId || null,
      }),
    );
  }

  const when = `${formatShortDate(local.date, weekdayOf(local.date))}, ${formatInstantHour(occurrence.startsAt)} — ${formatInstantHour(occurrence.endsAt)}`;

  if (view !== "form") {
    const isCancel = view === "confirm-cancel";
    return (
      <Modal title={isCancel ? "Cancelar esta aula?" : "Excluir esta aula?"} onClose={onClose}>
        <p className="fb-modal__text">
          {occurrence.name} · {when}{" "}
          {isCancel
            ? "sai da agenda dos clientes e continua no histórico. O horário fica livre para outra aula."
            : "será removida definitivamente, inclusive do histórico. Use só para aulas criadas por engano."}
        </p>
        <div className="fb-modal__footer" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="fb-btn-secondary"
            disabled={isSubmitting}
            onClick={() => setView("form")}
          >
            Voltar
          </button>
          <button
            type="button"
            className="fb-btn-danger"
            disabled={isSubmitting}
            onClick={() =>
              void run(() =>
                isCancel ? cancelOccurrence(occurrence.id) : deleteOccurrence(occurrence.id),
              )
            }
          >
            {isCancel ? "Confirmar cancelamento" : "Confirmar exclusão"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Editar aula" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <fieldset
          disabled={isCancelled || !canEdit}
          style={{ border: "none", margin: 0, padding: 0 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="fb-modal__field">
              <label htmlFor={`${formId}-template`}>Modalidade / template</label>
              <select id={`${formId}-template`} className="fb-field" value="current" disabled>
                <option value="current">{occurrence.name}</option>
              </select>
            </div>

            <div className="fb-modal__grid">
              <div className="fb-modal__field">
                <label htmlFor={`${formId}-date`}>Data</label>
                <input
                  id={`${formId}-date`}
                  type="date"
                  className="fb-field"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
              <div className="fb-modal__field">
                <label htmlFor={`${formId}-time`}>Horário</label>
                <input
                  id={`${formId}-time`}
                  type="time"
                  className="fb-field"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="fb-modal__field">
              <label htmlFor={`${formId}-instructor`}>Professor</label>
              <select
                id={`${formId}-instructor`}
                className="fb-field"
                value={instructorId}
                onChange={(event) => setInstructorId(event.target.value)}
              >
                <option value="">Sem professor</option>
                {instructorOptions.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="fb-modal__grid">
              <div className="fb-modal__field">
                <label htmlFor={`${formId}-capacity`}>Capacidade</label>
                <input
                  id={`${formId}-capacity`}
                  type="number"
                  min={1}
                  className="fb-field"
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  required
                />
              </div>
              <div className="fb-modal__field">
                <label htmlFor={`${formId}-duration`}>Duração (min)</label>
                <input
                  id={`${formId}-duration`}
                  type="number"
                  min={1}
                  className="fb-field"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </fieldset>

        {isCancelled && (
          <p className="fb-modal__text">Esta aula foi cancelada e continua no histórico.</p>
        )}
        {error !== null && <OccurrenceErrorBox error={error} />}

        <div className="fb-modal__footer">
          <div style={{ display: "flex" }}>
            {!isCancelled && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para cancelar aulas.">
                <button
                  type="button"
                  className="fb-btn-danger-text"
                  onClick={() => setView("confirm-cancel")}
                >
                  Cancelar aula
                </button>
              </BlockedAction>
            )}
            {/* Cancelada fica no histórico: não se oferece exclusão. */}
            {!isCancelled && (
              <BlockedAction
                allowed={canDelete}
                reason="Você não tem permissão para excluir aulas."
              >
                <button
                  type="button"
                  className="fb-btn-danger-text"
                  onClick={() => setView("confirm-delete")}
                >
                  Excluir aula
                </button>
              </BlockedAction>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            <button type="button" className="fb-btn-secondary" onClick={onClose}>
              Fechar
            </button>
            {!isCancelled && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para editar aulas.">
                <button
                  type="submit"
                  className="fb-btn-primary fb-btn-primary--sm"
                  disabled={isSubmitting}
                >
                  Salvar
                </button>
              </BlockedAction>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
