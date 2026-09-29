import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, ErrorCode, gymToday, type AdminReservationDetail } from "@fitburn/contracts";
import { Modal } from "../../components/Modal";
import { listClientAgenda } from "../../lib/agenda/client-api";
import { formatClassDay, formatClassMoment, formatInstantHour } from "../../lib/agenda/format";
import { ApiError } from "../../lib/auth/api";
import { listClients } from "../../lib/clients/api";
import {
  createAdminReservation,
  previewReservation,
  rescheduleAdminReservation,
} from "../../lib/reservations/admin-api";
import { describeRefusal } from "./refusal";

/** Quantos dias à frente a equipe enxerga aulas para reservar. */
const AGENDA_HORIZON_DAYS = 14;

/** Recusas da nova aula na remarcação: a reserva original continua confirmada. */
const TARGET_REFUSALS: ReadonlySet<string> = new Set([
  ErrorCode.CLASS_FULL,
  ErrorCode.SCHEDULE_CONFLICT,
  ErrorCode.OCCURRENCE_NOT_BOOKABLE,
  ErrorCode.DUPLICATE_RESERVATION,
]);

export type ReservationFormMode =
  | { kind: "create" }
  /** Remarcação: o cliente é o da reserva e não muda. */
  | { kind: "reschedule"; reservation: AdminReservationDetail };

/**
 * "Nova reserva (administrativa)" (ReservasAdmin.dc.html) e a remarcação em
 * nome do cliente. O cliente fica em destaque, a prévia de elegibilidade
 * ("pode reservar? por quê?") aparece antes de confirmar, e cada intenção
 * (cliente + aula) leva a sua chave de idempotência, reenviada nas novas
 * tentativas. Quem decide é o servidor, com as mesmas regras do cliente.
 */
export function ReservationFormModal({
  mode,
  onClose,
  onDone,
}: {
  mode: ReservationFormMode;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const formId = useId();
  const rescheduling = mode.kind === "reschedule";
  const [pickedClientId, setPickedClientId] = useState("");
  const [occurrenceId, setOccurrenceId] = useState("");
  // Uma chave por intenção: trocar cliente ou aula é outra intenção.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const clientId = rescheduling ? mode.reservation.client.id : pickedClientId;

  const clientsQuery = useQuery({
    queryKey: ["clients", "reservation-options"],
    queryFn: () => listClients(),
    enabled: !rescheduling,
  });
  const today = gymToday();
  const agendaQuery = useQuery({
    queryKey: ["client-agenda", "admin-options", today],
    queryFn: () => listClientAgenda(today, addDays(today, AGENDA_HORIZON_DAYS)),
  });

  const clients = clientsQuery.data ?? [];
  const occurrences = agendaQuery.data ?? [];
  const client = rescheduling
    ? mode.reservation.client
    : (clients.find((candidate) => candidate.id === pickedClientId) ?? null);
  const occurrence = occurrences.find((candidate) => candidate.id === occurrenceId) ?? null;
  const replacingReservationId = rescheduling ? mode.reservation.id : undefined;

  const previewQuery = useQuery({
    queryKey: ["admin-reservation-preview", clientId, occurrenceId, replacingReservationId],
    queryFn: () => previewReservation({ clientId, occurrenceId, replacingReservationId }),
    enabled: Boolean(clientId && occurrenceId),
    // A prévia é só informativa e envelhece rápido: sempre reconsulta.
    staleTime: 0,
    gcTime: 0,
  });
  const preview = previewQuery.data;

  const submitMutation = useMutation({
    mutationFn: () =>
      rescheduling
        ? rescheduleAdminReservation(mode.reservation.id, occurrenceId, idempotencyKey)
        : createAdminReservation(clientId, occurrenceId, idempotencyKey),
    onSuccess: () =>
      onDone(
        rescheduling
          ? `Reserva remarcada. ${mode.reservation.client.fullName} agora está em ${occurrence?.name ?? "a nova aula"}.`
          : `Reserva criada para ${client?.fullName ?? "o cliente"}.`,
      ),
    onError: (error) => {
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError("INTERNAL_ERROR", "Não foi possível concluir a reserva. Tente novamente."),
      );
      // Depois de uma recusa a disponibilidade mostrada pode ter mudado.
      void previewQuery.refetch();
    },
  });

  function pickIntent(next: { clientId?: string; occurrenceId?: string }) {
    if (next.clientId !== undefined) setPickedClientId(next.clientId);
    if (next.occurrenceId !== undefined) setOccurrenceId(next.occurrenceId);
    setIdempotencyKey(crypto.randomUUID());
    setSubmitError(null);
  }

  const occurrenceContext = occurrence
    ? { name: occurrence.name, capacity: occurrence.capacity }
    : null;

  function renderOutcome() {
    if (submitError) {
      const { title, text } = describeRefusal(submitError, occurrenceContext);
      // Recusa da nova aula: a transação foi desfeita e a original continua.
      const originalKept = rescheduling && TARGET_REFUSALS.has(submitError.code);
      return (
        <RefusalBox
          title={title}
          text={originalKept ? `${text} A reserva original continua confirmada.` : text}
        />
      );
    }
    if (!clientId || !occurrenceId) return null;
    if (previewQuery.isPending) {
      return <p className="fb-modal__text">Verificando disponibilidade…</p>;
    }
    if (preview?.reason) {
      const { title, text } = describeRefusal(preview.reason, occurrenceContext);
      return <RefusalBox title={title} text={text} />;
    }
    if (preview?.canBook) {
      return (
        <div role="status" className="fb-success-box">
          {rescheduling
            ? "Vaga disponível. A reserva atual será cancelada e o cliente confirmado na nova aula."
            : "Vaga disponível. A reserva será criada em nome do cliente selecionado."}
        </div>
      );
    }
    return <p className="fb-modal__text">Não foi possível verificar a disponibilidade agora.</p>;
  }

  const canConfirm =
    Boolean(clientId && occurrenceId) &&
    !previewQuery.isPending &&
    preview?.canBook !== false &&
    !submitMutation.isPending;

  return (
    <Modal
      title={rescheduling ? "Remarcar reserva" : "Nova reserva (administrativa)"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canConfirm) submitMutation.mutate();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {!rescheduling && (
          <div className="fb-modal__field">
            <label htmlFor={`${formId}-client`}>Cliente</label>
            <select
              id={`${formId}-client`}
              className="fb-field"
              value={pickedClientId}
              onChange={(event) => pickIntent({ clientId: event.target.value })}
            >
              <option value="">Selecione o cliente</option>
              {clients.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName}
                  {candidate.status === "INACTIVE" ? " (inativo)" : ""}
                </option>
              ))}
            </select>
            {clientsQuery.isError && (
              <span role="alert" className="fb-modal__caption">
                Não foi possível carregar os clientes.
              </span>
            )}
          </div>
        )}

        {client && (
          <div className="fb-client-highlight">
            <span className="fb-client-highlight__label">
              {rescheduling ? "Remarcando a reserva de" : "Reservando em nome de"}
            </span>
            <strong className="fb-client-highlight__name">{client.fullName}</strong>
            <span className="fb-client-highlight__email">{client.email}</span>
          </div>
        )}

        {rescheduling && (
          <p className="fb-modal__text">
            Reserva atual: {mode.reservation.occurrence.name},{" "}
            {formatClassMoment(mode.reservation.occurrence.startsAt)}.
          </p>
        )}

        <div className="fb-modal__field">
          <label htmlFor={`${formId}-occurrence`}>{rescheduling ? "Nova aula" : "Aula"}</label>
          <select
            id={`${formId}-occurrence`}
            className="fb-field"
            value={occurrenceId}
            onChange={(event) => pickIntent({ occurrenceId: event.target.value })}
          >
            <option value="">Selecione a aula</option>
            {occurrences.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} — {formatClassDay(candidate.startsAt)},{" "}
                {formatInstantHour(candidate.startsAt)} ({candidate.available}/{candidate.capacity}
                {candidate.available <= 0 ? " — lotada" : ""})
              </option>
            ))}
          </select>
          {agendaQuery.isError && (
            <span role="alert" className="fb-modal__caption">
              Não foi possível carregar as aulas.
            </span>
          )}
        </div>

        {renderOutcome()}

        <div className="fb-modal__footer" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="fb-btn-secondary" onClick={onClose}>
            Voltar
          </button>
          <button
            type="submit"
            className="fb-btn-primary fb-btn-primary--sm"
            disabled={!canConfirm}
          >
            {rescheduling ? "Confirmar remarcação" : "Confirmar reserva"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RefusalBox({ title, text }: { title: string | null; text: string }) {
  return (
    <div role="alert" className="fb-error-box">
      {title && <strong>{title} </strong>}
      {text}
    </div>
  );
}
