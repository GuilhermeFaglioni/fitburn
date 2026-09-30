import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
 * As ações de uma meta ativa (Concluir, Editar, Cancelar meta) recolhidas sob um botão "⋯": o cartão do artboard
 * (MetasAdmin.dc.html) não mostra botões, então ficam escondidas até o professor abrir.
 *
 * Padrão de disclosure (não é um menu ARIA): o botão tem `aria-expanded`/`aria-controls` e abre um grupo de
 * botões comuns. Aberto pelo teclado, o foco vai ao primeiro item; Esc fecha e devolve o foco ao botão; Tab para
 * fora do grupo fecha. Sem permissão (ou com outra ação em andamento), os itens ficam `aria-disabled` (continuam
 * focáveis) e o motivo aparece em texto, ligado a eles por `aria-describedby`.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusFirstRef = useRef(false);
  const panelId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!open) return;
    if (focusFirstRef.current) {
      focusFirstRef.current = false;
      panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(event: ReactMouseEvent<HTMLButtonElement>) {
    // detail 0: o clique veio do teclado (Enter/Espaço), então o foco entra no grupo.
    focusFirstRef.current = !open && event.detail === 0;
    setOpen(!open);
  }

  function choose(run: () => void) {
    if (!allowed) return;
    setOpen(false);
    triggerRef.current?.focus();
    run();
  }

  function itemProps(run: () => void) {
    return {
      type: "button" as const,
      "aria-disabled": !allowed ? true : undefined,
      "aria-describedby": !allowed && reason ? reasonId : undefined,
      onClick: () => choose(run),
    };
  }

  return (
    <div
      className="fb-goals__menu"
      ref={rootRef}
      onBlur={(event) => {
        // O foco foi para outro elemento fora do botão e do grupo: fecha, sem roubar o foco de onde ele foi.
        // (Sem relatedTarget, como o clique em botão no Safari, não fecha: o clique fora já fecha.)
        const next = event.relatedTarget as Node | null;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
      }}
      onKeyDown={(event) => {
        // Tab para fora do grupo (sem elemento seguinte focável, o foco vai para a barra do navegador).
        if (event.key !== "Tab") return;
        const buttons = rootRef.current?.querySelectorAll("button") ?? [];
        const edge = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
        if (event.target === edge) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="fb-goals__kebab"
        aria-label={`Ações da meta ${title}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <KebabIcon />
      </button>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="fb-goals__menu-list"
          role="group"
          aria-label={`Ações da meta ${title}`}
        >
          <button className="fb-goals__menu-item" {...itemProps(() => onAsk("complete"))}>
            Concluir
          </button>
          <button className="fb-goals__menu-item" {...itemProps(onEdit)}>
            Editar
          </button>
          <button
            className="fb-goals__menu-item fb-goals__menu-item--danger"
            {...itemProps(() => onAsk("cancel"))}
          >
            Cancelar meta
          </button>
          {!allowed && reason && (
            <span id={reasonId} className="fb-goals__menu-reason">
              {reason}
            </span>
          )}
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
              reason={canEdit ? (busy ? "Aguarde: há uma ação em andamento." : undefined) : denied}
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
