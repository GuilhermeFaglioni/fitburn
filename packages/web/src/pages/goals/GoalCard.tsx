import { GoalStatus, type GoalDetail } from "@fitburn/contracts";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { formatInstantDate, formatLocalDate } from "../../lib/agenda/format";

/** As ações de uma meta ativa. Concluir, editar e cancelar abrem um diálogo (a tela decide qual). */
export type GoalAction = "complete" | "edit" | "cancel";

interface GoalCardProps {
  goal: GoalDetail;
  canEdit: boolean;
  onAction: (action: GoalAction) => void;
}

/** O selo de cada situação: só a meta ativa ganha destaque; o significado vai sempre no texto. */
const STATUS_BADGE: Record<GoalDetail["status"], { label: string; tone: BadgeTone }> = {
  [GoalStatus.ACTIVE]: { label: "ATIVA", tone: "ok" },
  [GoalStatus.COMPLETED]: { label: "CONCLUÍDA", tone: "neutral" },
  [GoalStatus.CANCELLED]: { label: "CANCELADA", tone: "neutral" },
};

const DENIED = "Você não tem permissão para alterar metas.";

/** A última linha do cartão: o detalhe da meta e, se já concluída, "— concluída em dd/mm/aaaa". */
function goalDetail(goal: GoalDetail): string {
  const concluded = goal.concludedAt ? `concluída em ${formatInstantDate(goal.concludedAt)}` : "";
  if (goal.description && concluded) return `${goal.description} — ${concluded}`;
  if (concluded) return `${concluded.charAt(0).toUpperCase()}${concluded.slice(1)}`;
  return goal.description ?? "";
}

/**
 * Uma meta na tela do professor, num `Card`: título, situação em `Badge`, prazo e detalhe. Só a meta ativa tem as
 * ações (concluir, editar, cancelar), recolhidas sob o botão "⋯" (`ActionMenu`); a concluída e a cancelada ficam
 * neutras. Não há barra de progresso: a API não tem valor alvo nem progresso (a meta é concluída à mão).
 */
export function GoalCard({ goal, canEdit, onAction }: GoalCardProps) {
  const active = goal.status === GoalStatus.ACTIVE;
  const badge = STATUS_BADGE[goal.status];
  const detail = goalDetail(goal);

  return (
    <Card as="li" flat={!active} className={active ? "fb-ui-goal" : "fb-ui-goal fb-ui-goal--closed"}>
      <div className="fb-ui-goal__head">
        <h3 className="fb-ui-goal__title">{goal.title}</h3>
        <Badge tone={badge.tone} dot={active}>
          {badge.label}
        </Badge>
        {active && (
          <ActionMenu
            label={`Ações da meta ${goal.title}`}
            enabled={canEdit}
            disabledReason={canEdit ? undefined : DENIED}
            items={[
              {
                key: "complete",
                label: "Concluir",
                ariaLabel: `Concluir meta ${goal.title}`,
                onSelect: () => onAction("complete"),
              },
              {
                key: "edit",
                label: "Editar",
                ariaLabel: `Editar meta ${goal.title}`,
                onSelect: () => onAction("edit"),
              },
              {
                key: "cancel",
                label: "Cancelar meta",
                ariaLabel: `Cancelar meta ${goal.title}`,
                danger: true,
                onSelect: () => onAction("cancel"),
              },
            ]}
          />
        )}
      </div>
      {active && goal.dueDate && (
        <p className="fb-ui-goal__meta">Prazo: {formatLocalDate(goal.dueDate)}</p>
      )}
      {detail && <p className="fb-ui-goal__text">{detail}</p>}
    </Card>
  );
}
