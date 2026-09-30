import { useEffect, useRef, useState } from "react";
import { GoalStatus, type GoalDetail, type GoalStatusName } from "@fitburn/contracts";
import { formatInstantDate, formatLocalDate } from "../../lib/agenda/format";

interface GoalCardProps {
  goal: GoalDetail;
  canEdit: boolean;
  /** Há uma conclusão ou cancelamento em andamento: bloqueia as ações para não repetir o pedido. */
  busy: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

/** Selo das metas que já não estão ativas. */
const CLOSED_BADGE: Record<
  Exclude<GoalStatusName, "ACTIVE">,
  { label: string; className: string }
> = {
  [GoalStatus.COMPLETED]: { label: "CONCLUÍDA", className: "fb-badge--active" },
  [GoalStatus.CANCELLED]: { label: "CANCELADA", className: "fb-badge--inactive" },
};

/** As duas ações que não se desfazem e pedem confirmação. */
const CONFIRMATIONS = {
  complete: "Concluir a meta e dar os pontos ao aluno?",
  cancel: "Cancelar esta meta? Ela não poderá ser reativada.",
};

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12.5" cy="8" r="1.3" />
    </svg>
  );
}

/**
 * As ações de uma meta ativa (Concluir, Editar, Cancelar meta) num menu de "⋯": o cartão do artboard
 * (MetasAdmin.dc.html) não mostra botões, então as ações ficam recolhidas até o professor abrir o menu.
 */
function GoalActions({
  title,
  allowed,
  reason,
  onEdit,
  onAsk,
}: {
  title: string;
  allowed: boolean;
  reason: string | undefined;
  onEdit: () => void;
  onAsk: (action: keyof typeof CONFIRMATIONS) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <div className="fb-goals__menu" ref={rootRef}>
      <button
        type="button"
        className="fb-goals__kebab"
        aria-label={`Ações da meta ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <KebabIcon />
      </button>
      {open && (
        <div className="fb-goals__menu-list" role="menu" aria-label={`Ações da meta ${title}`}>
          <button
            type="button"
            role="menuitem"
            className="fb-goals__menu-item"
            disabled={!allowed}
            aria-disabled={!allowed ? true : undefined}
            title={reason}
            onClick={() => choose(() => onAsk("complete"))}
          >
            Concluir
          </button>
          <button
            type="button"
            role="menuitem"
            className="fb-goals__menu-item"
            disabled={!allowed}
            aria-disabled={!allowed ? true : undefined}
            title={reason}
            onClick={() => choose(onEdit)}
          >
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            className="fb-goals__menu-item fb-goals__menu-item--danger"
            disabled={!allowed}
            aria-disabled={!allowed ? true : undefined}
            title={reason}
            onClick={() => choose(() => onAsk("cancel"))}
          >
            Cancelar meta
          </button>
        </div>
      )}
    </div>
  );
}

/** A última linha do cartão: o detalhe da meta e, se já concluída, "— concluída em dd/mm/aaaa" (artboard). */
function goalDetail(goal: GoalDetail): string {
  const concluded = goal.concludedAt ? `concluída em ${formatInstantDate(goal.concludedAt)}` : "";
  if (goal.description && concluded) return `${goal.description} — ${concluded}`;
  if (concluded) return `${concluded.charAt(0).toUpperCase()}${concluded.slice(1)}`;
  return goal.description ?? "";
}

/**
 * Uma meta na tela do professor (MetasAdmin.dc.html): ativa, ou concluída/cancelada esmaecida. A barra
 * de progresso do artboard depende de valor alvo e progresso, que a API ainda não tem.
 */
export function GoalCard({ goal, canEdit, busy, onEdit, onComplete, onCancel }: GoalCardProps) {
  const [asking, setAsking] = useState<keyof typeof CONFIRMATIONS | null>(null);
  const denied = "Você não tem permissão para alterar metas.";
  const closedBadge = goal.status === GoalStatus.ACTIVE ? null : CLOSED_BADGE[goal.status];
  const detail = goalDetail(goal);

  function confirm() {
    if (asking === "complete") onComplete();
    else onCancel();
    setAsking(null);
  }

  return (
    <li className={`fb-goals__card${closedBadge ? " fb-goals__card--closed" : ""}`}>
      <div className="fb-goals__card-head">
        <span className="fb-goals__card-title">{goal.title}</span>
        {closedBadge ? (
          <span className={`fb-badge ${closedBadge.className}`}>{closedBadge.label}</span>
        ) : (
          <div className="fb-goals__card-side">
            {goal.dueDate && (
              <span className="fb-goals__card-meta">Prazo: {formatLocalDate(goal.dueDate)}</span>
            )}
            <GoalActions
              title={goal.title}
              allowed={canEdit && !busy}
              reason={canEdit ? undefined : denied}
              onEdit={onEdit}
              onAsk={setAsking}
            />
          </div>
        )}
      </div>
      {goal.status === GoalStatus.COMPLETED && (
        <div className="fb-goals__bar" aria-hidden="true">
          <div className="fb-goals__bar-fill fb-goals__bar-fill--done" />
        </div>
      )}
      {detail && <span className="fb-goals__card-text">{detail}</span>}

      {!closedBadge && asking && (
        <div className="fb-goals__card-actions">
          <span className="fb-goals__card-text">{CONFIRMATIONS[asking]}</span>
          <button type="button" className="fb-btn-primary fb-btn-primary--sm" onClick={confirm}>
            Confirmar
          </button>
          <button type="button" className="fb-btn-secondary" onClick={() => setAsking(null)}>
            Voltar
          </button>
        </div>
      )}
    </li>
  );
}
