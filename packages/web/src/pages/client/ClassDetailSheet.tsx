import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ErrorCode,
  gymToday,
  utcToGymDateTime,
  weekdayOf,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { useCloseOnEscape } from "../../components/Modal";
import { ApiError } from "../../lib/auth/api";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { formatInstantHour, formatShortDate } from "../../lib/agenda/format";
import { createReservation } from "../../lib/reservations/api";

type Outcome = { kind: "success" } | { kind: "refused"; error: ApiError };

interface RefusalAction {
  label: string;
  variant: "primary" | "ghost";
  onClick: () => void;
}

/**
 * Detalhe da aula com a ação de reserva (ReservaMobile/ReservaDesktop.dc.html):
 * bottom sheet no mobile, cartão centralizado no desktop. O backend decide a
 * reserva; qualquer resposta atualiza a agenda e o detalhe.
 */
export function ClassDetailSheet({
  item,
  onClose,
}: {
  item: ClientAgendaItem;
  onClose: () => void;
}) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Uma chave por intenção de reserva: gerada ao abrir o detalhe e reenviada
  // em toda nova tentativa, para uma repetição nunca criar outra reserva.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Recarrega para mostrar a disponibilidade mais recente (ainda informativa).
  const detailQuery = useQuery({
    queryKey: ["client-agenda", "item", item.id],
    queryFn: () => getClientAgendaItem(item.id),
    placeholderData: item,
  });
  const occurrence = detailQuery.data ?? item;

  const reserveMutation = useMutation({
    mutationFn: () => createReservation(item.id, idempotencyKey),
    onSuccess: () => setOutcome({ kind: "success" }),
    onError: (error) =>
      setOutcome({
        kind: "refused",
        error:
          error instanceof ApiError
            ? error
            : new ApiError(
                ErrorCode.INTERNAL_ERROR,
                "Não foi possível concluir a reserva. Tente novamente.",
              ),
      }),
    // Sucesso ou recusa: a tela nunca continua mostrando um estado desatualizado.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["client-agenda"] }),
  });

  useCloseOnEscape(onClose);

  const { date } = utcToGymDateTime(occurrence.startsAt);
  const day = date === gymToday() ? "Hoje" : formatShortDate(date, weekdayOf(date));

  /** A mensagem vem do backend (fonte única); aqui só se escolhe o próximo passo. */
  function nextStepAfter(error: ApiError): RefusalAction | null {
    switch (error.code) {
      case ErrorCode.CLASS_FULL:
      case ErrorCode.OCCURRENCE_NOT_BOOKABLE:
        return { label: "Ver outros horários", variant: "primary", onClick: onClose };
      case ErrorCode.DUPLICATE_RESERVATION:
        return { label: "Ver minha reserva", variant: "ghost", onClick: () => setOutcome(null) };
      case ErrorCode.INTERNAL_ERROR:
        // Falha de rede ou do servidor: o resultado é incerto, então a nova
        // tentativa reenvia a mesma chave.
        return {
          label: "Tentar novamente",
          variant: "primary",
          onClick: () => reserveMutation.mutate(),
        };
      default:
        return null;
    }
  }

  function renderAction(): ReactNode {
    if (outcome?.kind === "success") {
      return (
        <div className="fb-sheet__stack">
          <div className="fb-sheet-alert fb-sheet-alert--success" role="status">
            <CheckIcon />
            <span>Reserva confirmada com sucesso. Bom treino!</span>
          </div>
          <button type="button" className="fb-sheet-btn fb-sheet-btn--ghost" onClick={onClose}>
            Ver na agenda
          </button>
        </div>
      );
    }

    if (outcome?.kind === "refused") {
      const action = nextStepAfter(outcome.error);
      return (
        <div className="fb-sheet__stack">
          <div className="fb-sheet-alert fb-sheet-alert--error" role="alert">
            <AlertIcon />
            <span>{outcome.error.message}</span>
          </div>
          {action && (
            <button
              type="button"
              className={`fb-sheet-btn fb-sheet-btn--${action.variant}`}
              disabled={reserveMutation.isPending}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      );
    }

    if (occurrence.myReservationId) {
      return (
        <div className="fb-sheet__badges">
          <span className="fb-sheet-badge">RESERVA CONFIRMADA</span>
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

    return (
      <button
        type="button"
        className="fb-sheet-btn fb-sheet-btn--primary"
        disabled={reserveMutation.isPending || detailQuery.isError}
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
      <div className="fb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
