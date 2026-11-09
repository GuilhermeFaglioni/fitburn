import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { useAuth } from "../../lib/auth/AuthContext";
import { canSeeRoster } from "../../lib/attendance/roster-access";
import {
  cancelOccurrence,
  deleteOccurrence,
  getOccurrenceFormOptions,
  updateOccurrence,
} from "../../lib/agenda/api";
import { formatInstantHour, formatShortDate } from "../../lib/agenda/format";
import { instructorOptionLabel } from "./instructor-label";
import { OccurrenceErrorBox } from "./OccurrenceErrorBox";

type View = "form" | "confirm-cancel" | "confirm-delete";

/** "Editar aula" e a confirmação de cancelamento ou exclusão, em `Dialog` (D-038, #156). */
export function OccurrenceEditModal({
  occurrence,
  onClose,
  onChanged,
}: {
  occurrence: OccurrenceDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, can, scopeOf } = useAuth();
  const navigate = useNavigate();
  const optionsQuery = useQuery({
    queryKey: ["occurrence-options"],
    queryFn: getOccurrenceFormOptions,
  });
  const local = utcToGymDateTime(occurrence.startsAt);
  const isCancelled = occurrence.status === OccurrenceStatus.CANCELLED;
  const showRoster =
    !isCancelled &&
    canSeeRoster(occurrence.instructor?.id, { userId: user?.id, can, scopeOf });

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

  const titularId = optionsQuery.data?.templates.find(
    (template) => template.id === occurrence.templateId,
  )?.defaultInstructor?.id;

  const canEdit = can(Module.OCORRENCIAS, PermissionAction.EDIT);
  const canDelete = can(Module.OCORRENCIAS, PermissionAction.DELETE);

  // Reservas confirmadas travam o que invalidaria o compromisso dos clientes
  // (o backend recusa do mesmo jeito; aqui a ação já aparece bloqueada).
  const booked = occurrence.bookedCount;
  const hasReservations = !isCancelled && booked > 0;
  const reservationsLabel = `${booked} ${booked === 1 ? "reserva confirmada" : "reservas confirmadas"}`;

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
      <Dialog
        key={view}
        title={isCancel ? "Cancelar esta aula?" : "Excluir esta aula?"}
        onClose={onClose}
        description={`${occurrence.name} · ${when} ${
          isCancel
            ? "sai da agenda dos clientes e continua no histórico. O horário fica livre para outra aula."
            : "será removida definitivamente, inclusive do histórico. Use só para aulas criadas por engano."
        }`}
        actions={
          <>
            <Button disabled={isSubmitting} onClick={() => setView("form")}>
              Voltar
            </Button>
            <Button
              variant="danger"
              busy={isSubmitting}
              onClick={() =>
                void run(() =>
                  isCancel ? cancelOccurrence(occurrence.id) : deleteOccurrence(occurrence.id),
                )
              }
            >
              {isCancel ? "Confirmar cancelamento" : "Confirmar exclusão"}
            </Button>
          </>
        }
      />
    );
  }

  const locked = isCancelled || !canEdit;

  return (
    <Dialog key="form" title="Editar aula" onClose={onClose}>
      <form onSubmit={handleSubmit} aria-label="Editar aula" className="fb-ui-dialog__form">
        <Select label="Modalidade / template" value="current" disabled>
          <option value="current">{occurrence.name}</option>
        </Select>

        <div className="fb-ui-form-grid">
          <Field
            label="Data"
            type="date"
            disabled={locked || hasReservations}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
          <Field
            label="Horário"
            type="time"
            disabled={locked || hasReservations}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
          />
        </div>

        <Select
          label="Professor"
          disabled={locked}
          value={instructorId}
          onChange={(event) => setInstructorId(event.target.value)}
        >
          <option value="">Sem professor</option>
          {instructorOptions.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructorOptionLabel(instructor.fullName, instructor.id === titularId)}
            </option>
          ))}
        </Select>

        <div className="fb-ui-form-grid">
          <Field
            label="Capacidade"
            type="number"
            min={hasReservations ? booked : 1}
            disabled={locked}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
          <Field
            label="Duração (min)"
            type="number"
            min={1}
            disabled={locked || hasReservations}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            required
          />
        </div>

        {isCancelled && <p className="fb-ui-note">Esta aula foi cancelada e continua no histórico.</p>}
        {hasReservations && (
          <p role="note" className="fb-ui-notice">
            Esta aula tem {reservationsLabel}: não pode ser cancelada nem excluída, e horário e
            duração não podem mudar. A capacidade mínima é {booked}.
          </p>
        )}
        {error !== null && <OccurrenceErrorBox error={error} />}

        <div className="fb-ui-dialog__actions fb-ui-dialog__actions--between">
          <div className="fb-ui-actions-group">
            {!isCancelled && (
              <BlockedAction
                allowed={canEdit && !hasReservations}
                reason={
                  canEdit
                    ? `Esta aula tem ${reservationsLabel} e não pode ser cancelada.`
                    : "Você não tem permissão para cancelar aulas."
                }
              >
                <Button variant="ghost-danger" onClick={() => setView("confirm-cancel")}>
                  Cancelar aula
                </Button>
              </BlockedAction>
            )}
            {/* Cancelada fica no histórico: não se oferece exclusão. */}
            {!isCancelled && (
              <BlockedAction
                allowed={canDelete && !hasReservations}
                reason={
                  canDelete
                    ? `Esta aula tem ${reservationsLabel} e não pode ser excluída.`
                    : "Você não tem permissão para excluir aulas."
                }
              >
                <Button variant="ghost-danger" onClick={() => setView("confirm-delete")}>
                  Excluir aula
                </Button>
              </BlockedAction>
            )}
          </div>
          <div className="fb-ui-actions-group">
            <Button onClick={onClose}>Fechar</Button>
            {showRoster && (
              <Button
                onClick={() =>
                  navigate(`/presenca/${occurrence.id}`, {
                    state: { from: "/agenda-administrativa" },
                  })
                }
              >
                Ver alunos
              </Button>
            )}
            {!isCancelled && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para editar aulas.">
                <Button type="submit" variant="primary" busy={isSubmitting}>
                  Salvar
                </Button>
              </BlockedAction>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
