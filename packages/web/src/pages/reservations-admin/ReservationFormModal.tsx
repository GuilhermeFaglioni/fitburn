import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, ErrorCode, gymToday, type AdminReservationDetail } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Select";
import { listClientAgenda } from "../../lib/agenda/client-api";
import { formatClassDay, formatClassMoment, formatInstantHour } from "../../lib/agenda/format";
import { ApiError } from "../../lib/auth/api";
import {
  createAdminReservation,
  previewReservation,
  rescheduleAdminReservation,
  searchReservationClients,
} from "../../lib/reservations/admin-api";
import { describeRefusal } from "./refusal";
import { RequiresNetwork } from "../../components/RequiresNetwork";

/** Quantos dias à frente a equipe enxerga aulas para reservar. */
const AGENDA_HORIZON_DAYS = 14;

/** Código do erro sem corpo de domínio (falha do servidor): a solicitação pode não ter sido processada. */
const INTERNAL_ERROR_CODE = "INTERNAL_ERROR";

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
 * "Nova reserva (administrativa)" e a remarcação em
 * nome do cliente, em `Dialog` (D-038, #156). O cliente fica em destaque, a prévia de elegibilidade
 * ("pode reservar? por quê?") aparece antes de confirmar, e cada intenção
 * (cliente + aula) leva a sua chave de idempotência, reenviada só se a tentativa
 * falhou sem resposta do servidor; depois de uma recusa a chave é nova. Quem decide é o servidor, com as mesmas regras do cliente.
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
  const rescheduling = mode.kind === "reschedule";
  const [pickedClientId, setPickedClientId] = useState("");
  const [occurrenceId, setOccurrenceId] = useState("");
  // Uma chave por intenção: trocar cliente ou aula é outra intenção, e uma
  // recusa do servidor encerra a intenção (ver onError).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const clientId = rescheduling ? mode.reservation.client.id : pickedClientId;

  const clientsQuery = useQuery({
    queryKey: ["clients", "reservation-options"],
    queryFn: () => searchReservationClients(),
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
      // O servidor memoriza a resposta por (cliente, chave), recusas incluídas:
      // repetir a chave devolveria a recusa antiga mesmo que a situação tenha
      // mudado. Depois de uma recusa, a nova tentativa é uma nova solicitação.
      // Só uma falha sem resposta de domínio (rede, 500) reaproveita a chave.
      if (error instanceof ApiError && error.code !== INTERNAL_ERROR_CODE) {
        setIdempotencyKey(crypto.randomUUID());
      }
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(
              INTERNAL_ERROR_CODE,
              "Não foi possível concluir a reserva. Tente novamente.",
            ),
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
      return <p className="fb-ui-note">Verificando disponibilidade…</p>;
    }
    if (preview?.reason) {
      const { title, text } = describeRefusal(preview.reason, occurrenceContext);
      return <RefusalBox title={title} text={text} />;
    }
    if (preview?.canBook) {
      return (
        <Alert tone="ok">
          {rescheduling
            ? "Vaga disponível. A reserva atual será cancelada e o cliente confirmado na nova aula."
            : "Vaga disponível. A reserva será criada em nome do cliente selecionado."}
        </Alert>
      );
    }
    return <p className="fb-ui-note">Não foi possível verificar a disponibilidade agora.</p>;
  }

  const canConfirm =
    Boolean(clientId && occurrenceId) &&
    !previewQuery.isPending &&
    preview?.canBook !== false &&
    !submitMutation.isPending;

  return (
    <Dialog
      title={rescheduling ? "Remarcar reserva" : "Nova reserva (administrativa)"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canConfirm) submitMutation.mutate();
        }}
        aria-label={rescheduling ? "Remarcação de reserva" : "Nova reserva"}
        className="fb-ui-dialog__form"
      >
        {!rescheduling && (
          <Select
            label="Cliente"
            value={pickedClientId}
            onChange={(event) => pickIntent({ clientId: event.target.value })}
            error={clientsQuery.isError ? "Não foi possível carregar os clientes." : undefined}
          >
            <option value="">Selecione o cliente</option>
            {clients.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
              </option>
            ))}
          </Select>
        )}

        {client && (
          <div className="fb-ui-highlight">
            <span className="fb-ui-highlight__label">
              {rescheduling ? "Remarcando a reserva de" : "Reservando em nome de"}
            </span>
            <strong className="fb-ui-highlight__name">{client.fullName}</strong>
            <span className="fb-ui-highlight__sub">{client.email}</span>
          </div>
        )}

        {rescheduling && (
          <p className="fb-ui-note">
            Reserva atual: {mode.reservation.occurrence.name},{" "}
            {formatClassMoment(mode.reservation.occurrence.startsAt)}.
          </p>
        )}

        <Select
          label={rescheduling ? "Nova aula" : "Aula"}
          value={occurrenceId}
          onChange={(event) => pickIntent({ occurrenceId: event.target.value })}
          error={agendaQuery.isError ? "Não foi possível carregar as aulas." : undefined}
        >
          <option value="">Selecione a aula</option>
          {occurrences.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} — {formatClassDay(candidate.startsAt)},{" "}
              {formatInstantHour(candidate.startsAt)} ({candidate.available}/{candidate.capacity}
              {candidate.available <= 0 ? " — lotada" : ""})
            </option>
          ))}
        </Select>

        {renderOutcome()}

        <div className="fb-ui-dialog__actions">
          <Button onClick={onClose}>Cancelar</Button>
          <RequiresNetwork>
            <Button
              type="submit"
              variant="primary"
              busy={submitMutation.isPending}
              disabled={!canConfirm}
            >
              {rescheduling ? "Confirmar remarcação" : "Confirmar reserva"}
            </Button>
          </RequiresNetwork>
        </div>
      </form>
    </Dialog>
  );
}

function RefusalBox({ title, text }: { title: string | null; text: string }) {
  return (
    <Alert>
      {title && <strong>{title} </strong>}
      {text}
    </Alert>
  );
}
