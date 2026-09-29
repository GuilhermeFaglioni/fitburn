import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorCode, type ClientAgendaItem } from "@fitburn/contracts";
import { useCloseOnEscape, useDialogFocus } from "../../components/Modal";
import { ApiError } from "../../lib/auth/api";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { formatClassDay, formatClassMoment, formatInstantHour } from "../../lib/agenda/format";
import {
  cancelReservation,
  createReservation,
  rescheduleReservation,
} from "../../lib/reservations/api";

/** Remarcação em andamento: a reserva original, enquanto o cliente escolhe a nova aula. */
export interface Rescheduling {
  reservationId: string;
  from: ClientAgendaItem;
}

type Outcome =
  | { kind: "succeeded"; message: string }
  /** `retry` só existe para operações seguras de repetir (reserva e remarcação, idempotentes). */
  | { kind: "refused"; error: ApiError; retry?: () => void }
  /** Recusa de negócio na remarcação: a reserva original continua confirmada. */
  | { kind: "rescheduleRefused"; error: ApiError };

interface NextStep {
  label: string;
  variant: "primary" | "ghost";
  onClick: () => void;
}

/**
 * Recusas da nova aula na remarcação: a transação foi desfeita e a reserva
 * original continua confirmada. Qualquer outro erro (original inativa, aula
 * já iniciada, falha do servidor) não permite afirmar isso.
 */
const RESCHEDULE_TARGET_REFUSALS: ReadonlySet<string> = new Set([
  ErrorCode.CLASS_FULL,
  ErrorCode.SCHEDULE_CONFLICT,
  ErrorCode.OCCURRENCE_NOT_BOOKABLE,
  ErrorCode.DUPLICATE_RESERVATION,
]);

/** Falha de rede ou erro sem envelope: o resultado da operação é incerto. */
function asApiError(error: Error, message: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(ErrorCode.INTERNAL_ERROR, message);
}

/**
 * Detalhe da aula com as ações de reserva (ReservaMobile/ReservaDesktop.dc.html):
 * bottom sheet no mobile, cartão centralizado no desktop. O backend decide
 * cada operação; qualquer resposta atualiza a agenda e o detalhe.
 */
export function ClassDetailSheet({
  item,
  rescheduling,
  onStartRescheduling,
  onRescheduled,
  onClose,
}: {
  item: ClientAgendaItem;
  rescheduling: Rescheduling | null;
  onStartRescheduling: (rescheduling: Rescheduling) => void;
  onRescheduled: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Uma chave por intenção (reservar ou remarcar para esta aula): gerada ao
  // abrir o detalhe e reenviada em toda nova tentativa, para uma repetição
  // nunca agir duas vezes.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Recarrega para mostrar a disponibilidade mais recente (ainda informativa).
  const detailQuery = useQuery({
    queryKey: ["client-agenda", "item", item.id],
    queryFn: () => getClientAgendaItem(item.id),
    placeholderData: item,
  });
  const occurrence = detailQuery.data ?? item;

  // Sucesso ou recusa: agenda, detalhe e histórico nunca ficam desatualizados.
  const refreshReservationViews = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["client-agenda"] }),
      queryClient.invalidateQueries({ queryKey: ["my-reservations"] }),
    ]);

  const reserveMutation = useMutation({
    mutationFn: () => createReservation(item.id, idempotencyKey),
    onSuccess: () =>
      setOutcome({ kind: "succeeded", message: "Reserva confirmada com sucesso. Bom treino!" }),
    onError: (error) =>
      setOutcome({
        kind: "refused",
        error: asApiError(error, "Não foi possível concluir a reserva. Tente novamente."),
        retry: () => reserveMutation.mutate(),
      }),
    onSettled: refreshReservationViews,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelReservation,
    onSuccess: () =>
      setOutcome({
        kind: "succeeded",
        message: "Reserva cancelada. A vaga foi liberada para outros clientes.",
      }),
    // Sem "Tentar novamente": o cancelamento não é idempotente, e um primeiro
    // envio que chegou a valer faria a repetição parecer uma falha. "Voltar"
    // mostra o estado atualizado da reserva.
    onError: (error) =>
      setOutcome({
        kind: "refused",
        error: asApiError(error, "Não foi possível cancelar a reserva. Tente novamente."),
      }),
    onSettled: () => {
      setConfirmingCancel(false);
      return refreshReservationViews();
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: (reservationId: string) =>
      rescheduleReservation(reservationId, item.id, idempotencyKey),
    onSuccess: () => {
      onRescheduled();
      setOutcome({ kind: "succeeded", message: "Reserva remarcada. Bom treino!" });
    },
    onError: (error, reservationId) => {
      const apiError = asApiError(error, "Não foi possível remarcar a reserva. Tente novamente.");
      setOutcome(
        RESCHEDULE_TARGET_REFUSALS.has(apiError.code)
          ? { kind: "rescheduleRefused", error: apiError }
          : {
              // Resultado incerto (rede/servidor) ou a original mudou: não se
              // afirma que ela continua; a repetição usa a mesma chave.
              kind: "refused",
              error: apiError,
              retry: () => rescheduleMutation.mutate(reservationId),
            },
      );
    },
    onSettled: refreshReservationViews,
  });

  const pending =
    reserveMutation.isPending || cancelMutation.isPending || rescheduleMutation.isPending;

  const dialogRef = useDialogFocus<HTMLDivElement>();
  useCloseOnEscape(onClose);

  const day = formatClassDay(occurrence.startsAt);

  /** A mensagem vem do backend (fonte única); aqui só se escolhe o próximo passo. */
  function nextStepAfter(refusal: Extract<Outcome, { kind: "refused" }>): NextStep {
    // Volta ao detalhe, já atualizado depois da recusa.
    const back: NextStep = { label: "Voltar", variant: "ghost", onClick: () => setOutcome(null) };
    switch (refusal.error.code) {
      case ErrorCode.CLASS_FULL:
      case ErrorCode.OCCURRENCE_NOT_BOOKABLE:
        return { label: "Ver outros horários", variant: "primary", onClick: onClose };
      case ErrorCode.DUPLICATE_RESERVATION:
        return { label: "Ver minha reserva", variant: "ghost", onClick: () => setOutcome(null) };
      case ErrorCode.SCHEDULE_CONFLICT:
        return { label: "Ver minha agenda", variant: "ghost", onClick: onClose };
      case ErrorCode.INTERNAL_ERROR:
        // Resultado incerto: a reserva pode ser repetida com a mesma chave de
        // idempotência sem risco de duplicar.
        if (refusal.retry) {
          return { label: "Tentar novamente", variant: "primary", onClick: refusal.retry };
        }
        return back;
      default:
        return back;
    }
  }

  function renderAction(): ReactNode {
    if (outcome?.kind === "succeeded") {
      return (
        <div className="fb-sheet__stack">
          <div className="fb-sheet-alert fb-sheet-alert--success" role="status">
            <CheckIcon />
            <span>{outcome.message}</span>
          </div>
          <button type="button" className="fb-sheet-btn fb-sheet-btn--ghost" onClick={onClose}>
            Ver na agenda
          </button>
        </div>
      );
    }

    if (outcome?.kind === "rescheduleRefused" && rescheduling) {
      const { from } = rescheduling;
      return (
        <div className="fb-sheet__stack">
          <div className="fb-sheet-alert fb-sheet-alert--error" role="alert">
            <AlertIcon />
            <span>
              Não foi possível remarcar. {outcome.error.message} Sua reserva original em {from.name}
              , {formatClassMoment(from.startsAt)} continua confirmada.
            </span>
          </div>
          <div className="fb-sheet__badges">
            <span className="fb-sheet-badge">RESERVA ORIGINAL ATIVA</span>
          </div>
          <button type="button" className="fb-sheet-btn fb-sheet-btn--ghost" onClick={onClose}>
            Tentar remarcar novamente
          </button>
        </div>
      );
    }

    if (outcome?.kind === "refused") {
      const next = nextStepAfter(outcome);
      return (
        <div className="fb-sheet__stack">
          <div className="fb-sheet-alert fb-sheet-alert--error" role="alert">
            <AlertIcon />
            <span>{outcome.error.message}</span>
          </div>
          <button
            type="button"
            className={`fb-sheet-btn fb-sheet-btn--${next.variant}`}
            disabled={pending}
            onClick={next.onClick}
          >
            {next.label}
          </button>
        </div>
      );
    }

    const reservationId = occurrence.myReservationId;
    if (reservationId && confirmingCancel) {
      return (
        <div className="fb-sheet__stack">
          <p className="fb-sheet__description">
            Cancelar sua reserva em {occurrence.name}, {formatClassMoment(occurrence.startsAt)}? A
            vaga será liberada para outros clientes.
          </p>
          <div className="fb-sheet__actions">
            <button
              type="button"
              className="fb-sheet-btn fb-sheet-btn--ghost"
              disabled={pending}
              onClick={() => setConfirmingCancel(false)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="fb-sheet-btn fb-sheet-btn--danger"
              disabled={pending}
              onClick={() => cancelMutation.mutate(reservationId)}
            >
              Confirmar cancelamento
            </button>
          </div>
        </div>
      );
    }

    if (reservationId) {
      return (
        <div className="fb-sheet__stack">
          <div className="fb-sheet__badges">
            <span className="fb-sheet-badge">RESERVA CONFIRMADA</span>
          </div>
          <div className="fb-sheet__actions">
            <button
              type="button"
              className="fb-sheet-btn fb-sheet-btn--ghost"
              // A aula já começou (saiu da agenda): a mensagem acima explica,
              // e o backend recusaria de qualquer forma.
              disabled={detailQuery.isError}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancelar reserva
            </button>
            <button
              type="button"
              className="fb-sheet-btn fb-sheet-btn--primary"
              disabled={detailQuery.isError}
              onClick={() => onStartRescheduling({ reservationId, from: occurrence })}
            >
              Remarcar
            </button>
          </div>
        </div>
      );
    }

    if (occurrence.available <= 0) {
      return (
        <button type="button" className="fb-sheet-btn fb-sheet-btn--primary" disabled>
          Aula lotada
        </button>
      );
    }

    if (rescheduling) {
      const originalId = rescheduling.reservationId;
      return (
        <button
          type="button"
          className="fb-sheet-btn fb-sheet-btn--primary"
          disabled={pending || detailQuery.isError}
          onClick={() => rescheduleMutation.mutate(originalId)}
        >
          Remarcar para esta aula
        </button>
      );
    }

    return (
      <button
        type="button"
        className="fb-sheet-btn fb-sheet-btn--primary"
        disabled={pending || detailQuery.isError}
        onClick={() => reserveMutation.mutate()}
      >
        Reservar
      </button>
    );
  }

  return (
    <div
      className="fb-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="fb-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="fb-sheet__handle" aria-hidden="true" />

        <div className="fb-sheet__header">
          <div className="fb-sheet__heading">
            <h2 id={titleId} className="fb-sheet__title">
              {occurrence.name}
            </h2>
            <span className="fb-sheet__subtitle">
              {day}, {formatInstantHour(occurrence.startsAt)} –{" "}
              {formatInstantHour(occurrence.endsAt)}
            </span>
          </div>
          <button type="button" aria-label="Fechar" className="fb-sheet__x" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="fb-sheet__facts">
          {occurrence.instructor && (
            <span className="fb-sheet__fact">
              <PersonIcon />
              Prof. {occurrence.instructor.fullName}
            </span>
          )}
          <span className="fb-sheet__fact">
            <ClockIcon />
            Duração de {occurrence.durationMinutes} minutos
          </span>
          <span className="fb-sheet__fact">
            <SpotsIcon />
            {occurrence.available} de {occurrence.capacity} vagas restantes
          </span>
        </div>

        {occurrence.description && (
          <p className="fb-sheet__description">{occurrence.description}</p>
        )}

        {detailQuery.isError && !outcome && (
          <p role="alert" className="fb-sheet__description">
            Esta aula não está mais disponível na agenda (foi cancelada ou já começou).
          </p>
        )}

        <div className="fb-sheet__divider" />

        {renderAction()}

        <button type="button" className="fb-sheet__close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

const FACT_STROKE = "rgba(255,255,255,0.5)";

function PersonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.5" stroke={FACT_STROKE} strokeWidth="1.3" />
      <path
        d="M3 13c0.8-2.6 2.6-4 5-4s4.2 1.4 5 4"
        stroke={FACT_STROKE}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke={FACT_STROKE} strokeWidth="1.3" />
      <path d="M8 4.5V8L10.3 9.6" stroke={FACT_STROKE} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SpotsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 13V4.5C2 3.7 2.7 3 3.5 3H12.5C13.3 3 14 3.7 14 4.5V13"
        stroke={FACT_STROKE}
        strokeWidth="1.3"
      />
      <path d="M2 9H14" stroke={FACT_STROKE} strokeWidth="1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5L6.2 11.5L13 4"
        stroke="#ed6e34"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="#c23a1f" strokeWidth="1.4" />
      <path d="M8 4.5V8.5" stroke="#c23a1f" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.9" fill="#c23a1f" />
    </svg>
  );
}
