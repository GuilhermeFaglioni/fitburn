import { useQuery } from "@tanstack/react-query";
import { GoalStatus, type GoalDetail } from "@fitburn/contracts";
import { formatInstantDate, formatLocalDate } from "../../lib/agenda/format";
import { listMyGoals } from "../../lib/goals/api";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";

/** Abaixo do título da meta: a data de conclusão, ou o prazo se ainda está ativa. */
function goalMeta(goal: GoalDetail): string {
  if (goal.status === GoalStatus.COMPLETED && goal.concludedAt) {
    return `Concluída em ${formatInstantDate(goal.concludedAt)}`;
  }
  return goal.dueDate ? `Prazo: ${formatLocalDate(goal.dueDate)}` : "";
}

function GoalItem({ goal }: { goal: GoalDetail }) {
  const done = goal.status === GoalStatus.COMPLETED;
  const meta = goalMeta(goal);
  return (
    <Card as="li" flat className={`fb-gami__goal${done ? " fb-gami__goal--done" : ""}`}>
      <div className="fb-gami__goal-text">
        <span className="fb-gami__goal-title">{goal.title}</span>
        {meta && <span className="fb-gami__goal-meta">{meta}</span>}
        {goal.description && <span className="fb-gami__goal-desc">{goal.description}</span>}
      </div>
      {done && (
        <Badge tone="ok" dot>
          Concluída
        </Badge>
      )}
    </Card>
  );
}

/**
 * "Metas do professor": as metas ativas e as concluídas do cliente, cada uma num cartão com o prazo ou a data de
 * conclusão. A meta não tem progresso parcial na API (o professor a conclui à mão), então não há barra aqui.
 */
export function GoalsSection() {
  const goalsQuery = useQuery({ queryKey: ["goals", "mine"], queryFn: listMyGoals });

  return (
    <section className="fb-gami__section" aria-labelledby="fb-gami-goals">
      <h2 id="fb-gami-goals" className="fb-gami__section-title">
        Metas do professor
      </h2>
      <QueryBlockState
        query={goalsQuery}
        loading="Carregando metas…"
        error="Não foi possível carregar as metas."
        hasData={goalsQuery.data !== undefined}
      />
      {goalsQuery.isSuccess &&
        (goalsQuery.data.length === 0 ? (
          <EmptyState title="Nenhuma meta no momento." />
        ) : (
          <ul className="fb-gami__goal-list">
            {goalsQuery.data.map((goal) => (
              <GoalItem key={goal.id} goal={goal} />
            ))}
          </ul>
        ))}
    </section>
  );
}
