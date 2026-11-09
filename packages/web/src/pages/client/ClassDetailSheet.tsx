import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AvailabilityLevel,
  availabilityLevel,
  ErrorCode,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { formatClassDay, formatClassMoment, formatInstantHour } from "../../lib/agenda/format";
import {
  cancelReservation,
  createReservation,
  rescheduleReservation,
} from "../../lib/reservations/api";
import { RequiresNetwork } from "../../components/RequiresNetwork";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Meter } from "../../components/ui/Meter";
import { ErrorState, LoadingState, OfflineState } from "../../components/ui/States";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import { firstName } from "../../lib/names";

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
  variant: "primary" | "secondary";
  onClick: () => void;
}

/** O que a folha mostra conforme o estado: o aviso no corpo e os botões no rodapé fixo. */
interface SheetAction {
  notice?: ReactNode;
  footer: ReactNode;
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
 * Detalhe da aula com as ações de reserva (D-038, #156): `Dialog` em folha, que sobe da borda inferior no celular e é
 * um cartão centralizado no desktop. O botão principal fica no rodapé fixo. O backend decide cada operação (a lógica
 * de reserva, cancelamento e remarcação é a mesma de antes); qualquer resposta atualiza a agenda e o detalhe.
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

  const { offline } = useNetworkRequired();

  const day = formatClassDay(occurrence.startsAt);
  const level = availabilityLevel(occurrence.available, occurrence.capacity);
  const occupied = Math.max(0, occurrence.capacity - occurrence.available);

  /** A mensagem vem do backend (fonte única); aqui só se escolhe o próximo passo. */
  function nextStepAfter(refusal: Extract<Outcome, { kind: "refused" }>): NextStep {
    // Volta ao detalhe, já atualizado depois da recusa.
    const back: NextStep = {
      label: "Voltar",
      variant: "secondary",
      onClick: () => setOutcome(null),
    };
    switch (refusal.error.code) {
      case ErrorCode.CLASS_FULL:
      case ErrorCode.OCCURRENCE_NOT_BOOKABLE:
        return { label: "Ver outros horários", variant: "primary", onClick: onClose };
      case ErrorCode.DUPLICATE_RESERVATION:
        return {
          label: "Ver minha reserva",
          variant: "secondary",
          onClick: () => setOutcome(null),
        };
      case ErrorCode.SCHEDULE_CONFLICT:
        return { label: "Ver minha agenda", variant: "secondary", onClick: onClose };
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

  function renderAction(): SheetAction {
    if (outcome?.kind === "succeeded") {
      return {
        notice: <Alert tone="ok">{outcome.message}</Alert>,
        footer: (
          <Button block onClick={onClose}>
            Ver na agenda
          </Button>
        ),
      };
    }

    if (outcome?.kind === "rescheduleRefused" && rescheduling) {
      const { from } = rescheduling;
      return {
        notice: (
          <>
            <Alert tone="err">
              Não foi possível remarcar. {outcome.error.message} Sua reserva original em {from.name}
              , {formatClassMoment(from.startsAt)} continua confirmada.
            </Alert>
            <div>
              <Badge tone="neutral">RESERVA ORIGINAL ATIVA</Badge>
            </div>
          </>
        ),
        footer: (
          <Button block onClick={onClose}>
            Tentar remarcar novamente
          </Button>
        ),
      };
    }

    if (outcome?.kind === "refused") {
      const next = nextStepAfter(outcome);
      const conflict = outcome.error.code === ErrorCode.SCHEDULE_CONFLICT;
      return {
        notice: (
          <Alert tone="err">
            {/* A mensagem vem do backend e diz qual é a outra aula; o prefixo só nomeia o tipo de recusa. */}
            {conflict && <strong>Conflito de reserva: </strong>}
            {outcome.error.message}
          </Alert>
        ),
        footer: (
          <Button block variant={next.variant} disabled={pending} onClick={next.onClick}>
            {next.label}
          </Button>
        ),
      };
    }

    const reservationId = occurrence.myReservationId;
    if (reservationId && confirmingCancel) {
      return {
        notice: (
          <p className="fb-sheet__text">
            Cancelar sua reserva em {occurrence.name}, {formatClassMoment(occurrence.startsAt)}? A
            vaga será liberada para outros clientes.
          </p>
        ),
        footer: (
          <div className="fb-sheet__actions">
            <Button disabled={pending} onClick={() => setConfirmingCancel(false)}>
              Voltar
            </Button>
            <RequiresNetwork>
              <Button
                variant="danger"
                busy={cancelMutation.isPending}
                disabled={pending && !cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(reservationId)}
              >
                Confirmar cancelamento
              </Button>
            </RequiresNetwork>
          </div>
        ),
      };
    }

    if (reservationId) {
      return {
        notice: (
          <div>
            <Badge tone="ok" dot>
              RESERVA CONFIRMADA
            </Badge>
          </div>
        ),
        footer: (
          <div className="fb-sheet__actions">
            <Button
              // A aula já começou (saiu da agenda): a mensagem acima explica,
              // e o backend recusaria de qualquer forma.
              disabled={detailQuery.isError}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancelar reserva
            </Button>
            <Button
              variant="primary"
              disabled={detailQuery.isError}
              onClick={() => onStartRescheduling({ reservationId, from: occurrence })}
            >
              Remarcar
            </Button>
          </div>
        ),
      };
    }

    if (occurrence.available <= 0) {
      return {
        footer: (
          <Button block variant="primary" disabled>
            Aula lotada
          </Button>
        ),
      };
    }

    if (rescheduling) {
      const originalId = rescheduling.reservationId;
      return {
        footer: (
          <RequiresNetwork>
            <Button
              block
              variant="primary"
              busy={rescheduleMutation.isPending}
              disabled={detailQuery.isError}
              onClick={() => rescheduleMutation.mutate(originalId)}
            >
              Remarcar para esta aula
            </Button>
          </RequiresNetwork>
        ),
      };
    }

    return {
      footer: (
        <RequiresNetwork>
          <Button
            block
            variant="primary"
            busy={reserveMutation.isPending}
            disabled={detailQuery.isError}
            onClick={() => reserveMutation.mutate()}
          >
            Reservar aula <span aria-hidden="true">→</span>
          </Button>
        </RequiresNetwork>
      ),
    };
  }

  const action = renderAction();

  return (
    <Dialog
      variant="sheet"
      title={occurrence.name}
      description={`${day} · ${formatInstantHour(occurrence.startsAt)} às ${formatInstantHour(occurrence.endsAt)}`}
      onClose={onClose}
      eyebrow={
        <div className="fb-sheet__eyebrow">
          <Badge tone="brand">{occurrence.modality.name}</Badge>
        </div>
      }
      topBar={
        <>
          <Button variant="ghost" size="sm" aria-label="Voltar para a agenda" onClick={onClose}>
            <BackIcon />
            Agenda
          </Button>
          <Button variant="ghost" size="sm" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </Button>
        </>
      }
      footer={action.footer}
    >
      <dl className="fb-sheet__kv">
        {occurrence.instructor && (
          <div>
            <dt>Professor</dt>
            <dd>Prof. {firstName(occurrence.instructor.fullName)}</dd>
          </div>
        )}
        <div>
          <dt>Duração</dt>
          <dd>{occurrence.durationMinutes} minutos</dd>
        </div>
      </dl>

      {occurrence.description && <p className="fb-sheet__text">{occurrence.description}</p>}

      <div className="fb-sheet__spots">
        <span className="fb-sheet__spots-label">
          Disponibilidade
          {level === AvailabilityLevel.FULL && <Badge tone="err">Lotada</Badge>}
          {level === AvailabilityLevel.ALMOST_FULL && <Badge tone="warn">Quase lotada</Badge>}
        </span>
        <span className="fb-sheet__spots-count">
          {occurrence.available} de {occurrence.capacity} vagas
        </span>
      </div>
      <Meter
        value={occupied}
        max={occurrence.capacity}
        label={`${occupied} de ${occurrence.capacity} vagas ocupadas`}
      />

      {!outcome && detailQuery.isPlaceholderData && (
        <LoadingState className="fb-sheet__state" label="Atualizando disponibilidade…" />
      )}
      {!outcome && detailQuery.isError && (
        <ErrorState
          className="fb-sheet__state"
          title="Aula indisponível"
          description="Esta aula não está mais disponível na agenda (foi cancelada ou já começou)."
        />
      )}
      {!outcome && offline && (
        <OfflineState
          className="fb-sheet__state"
          description="Para reservar ou cancelar, volte a ficar online. A disponibilidade abaixo pode estar desatualizada."
        />
      )}

      {action.notice}

      <p className="fb-sheet__note">
        <InfoIcon />
        <span>
          A disponibilidade mostrada é informativa; a confirmação depende das vagas no momento da
          reserva.
        </span>
      </p>
    </Dialog>
  );
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="fb-sheet__note-icon" width="16" height="16" viewBox="0 0 24 24" {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5h.01" />
    </svg>
  );
}
