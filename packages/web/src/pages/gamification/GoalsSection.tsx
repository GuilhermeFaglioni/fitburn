import { useQuery } from "@tanstack/react-query";
import { GoalStatus, type GoalDetail } from "@fitburn/contracts";
import { formatInstantDate, formatLocalDate } from "../../lib/agenda/format";
import { listMyGoals } from "../../lib/goals/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";

/** À direita do título da meta: a data de conclusão, ou o prazo se ainda está ativa. */
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
    <li className={`fb-gami__goal${done ? " fb-gami__goal--done" : ""}`}>
      <div className="fb-gami__goal-head">
        <span className="fb-gami__goal-title">{goal.title}</span>
        {meta && <span className="fb-gami__goal-meta">{meta}</span>}
      </div>
      {goal.description && <span className="fb-gami__goal-text">{goal.description}</span>}
    </li>
  );
}

/**
 * "Metas do professor" da tela Sua evolução (GamificacaoMobile/Desktop.dc.html):
 * as metas ativas e as concluídas do cliente. O artboard mostra "3/4" e uma
 * barra de progresso, que o spec não prevê (a meta é concluída à mão pelo
 * professor): cada meta mostra o prazo ou a data de conclusão.
 */
export function GoalsSection() {
  const goalsQuery = useQuery({ queryKey: ["goals", "mine"], queryFn: listMyGoals });

  return (
    <section className="fb-gami__section fb-gami__goals" aria-labelledby="fb-gami-goals">
      <h2 id="fb-gami-goals" className="fb-gami__section-title">
        Metas do professor
      </h2>
      {goalsQuery.isLoading && <LoadingState surface="dark" />}
      {goalsQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar as metas."
          onRetry={() => void goalsQuery.refetch()}
        />
      )}
      {goalsQuery.isSuccess &&
        (goalsQuery.data.length === 0 ? (
          <EmptyState surface="dark" message="Nenhuma meta no momento." />
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
