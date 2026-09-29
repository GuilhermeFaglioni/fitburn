import { useState } from "react";
import { GoalStatus, type GoalDetail, type GoalStatusName } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
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

/** Uma meta na tela do professor (MetasAdmin.dc.html): ativa, ou concluída/cancelada esmaecida. */
export function GoalCard({ goal, canEdit, busy, onEdit, onComplete, onCancel }: GoalCardProps) {
  const [asking, setAsking] = useState<keyof typeof CONFIRMATIONS | null>(null);
  const denied = "Você não tem permissão para alterar metas.";
  const closedBadge = goal.status === GoalStatus.ACTIVE ? null : CLOSED_BADGE[goal.status];

  function confirm() {
    if (asking === "complete") onComplete();
    else onCancel();
    setAsking(null);
  }

  return (
    <li className={`fb-goals__card${closedBadge ? " fb-goals__card--closed" : ""}`}>
      <div className="fb-goals__card-head">
        <span className="fb-goals__card-title">{goal.title}</span>
        {!closedBadge && goal.dueDate && (
          <span className="fb-goals__card-meta">Prazo: {formatLocalDate(goal.dueDate)}</span>
        )}
        {closedBadge && (
          <span className={`fb-badge ${closedBadge.className}`}>{closedBadge.label}</span>
        )}
      </div>
      {goal.description && <span className="fb-goals__card-text">{goal.description}</span>}
      {goal.concludedAt && (
        <span className="fb-goals__card-text">
          concluída em {formatInstantDate(goal.concludedAt)}
        </span>
      )}

      {!closedBadge && !asking && (
        <div className="fb-goals__card-actions">
          <BlockedAction allowed={canEdit && !busy} reason={canEdit ? undefined : denied}>
            <button type="button" className="fb-row-btn" onClick={() => setAsking("complete")}>
              Concluir
            </button>
          </BlockedAction>
          <BlockedAction allowed={canEdit && !busy} reason={canEdit ? undefined : denied}>
            <button type="button" className="fb-row-btn" onClick={onEdit}>
              Editar
            </button>
          </BlockedAction>
          <BlockedAction allowed={canEdit && !busy} reason={canEdit ? undefined : denied}>
            <button
              type="button"
              className="fb-row-btn fb-row-btn--danger"
              onClick={() => setAsking("cancel")}
            >
              Cancelar meta
            </button>
          </BlockedAction>
        </div>
      )}
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
