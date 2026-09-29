import { useQuery } from "@tanstack/react-query";
import { PlanAssignmentStatus, type PlanAssignment } from "@fitburn/contracts";
import { formatLocalDate } from "../lib/agenda/format";
import { getMyPlan } from "../lib/plans/api";

function HistoryItem({ item }: { item: PlanAssignment }) {
  return (
    <li className="fb-plan__history-item">
      <div className="fb-plan__history-info">
        <span className="fb-plan__history-name">{item.plan.name}</span>
        <span className="fb-plan__history-dates">
          {formatLocalDate(item.startDate)} – {formatLocalDate(item.endDate)}
        </span>
      </div>
      <span className="fb-plan__history-status">
        {item.status === PlanAssignmentStatus.ACTIVE ? "ATIVO" : "ENCERRADO"}
      </span>
    </li>
  );
}

/**
 * Plano (PlanoDesktop.dc.html / PlanoMobile.dc.html): o plano ativo do
 * cliente com as datas, e o histórico. Informativo: sem oferta, preço nem
 * checkout — quem quer um plano fala com a recepção.
 */
export function PlanPage() {
  const planQuery = useQuery({ queryKey: ["plans", "mine"], queryFn: getMyPlan });
  const plan = planQuery.data;

  return (
    <div className="fb-plan">
      <h1 className="fb-plan__title">Plano</h1>

      {planQuery.isError && (
        <p role="alert" className="fb-plan__alert">
          Não foi possível carregar o seu plano.
        </p>
      )}

      {plan?.active && (
        <section className="fb-plan__card" aria-label="Plano ativo">
          <div className="fb-plan__card-head">
            <span className="fb-plan__card-name">{plan.active.plan.name}</span>
            <span className="fb-plan__badge">ATIVO</span>
          </div>
          {plan.active.plan.description && (
            <p className="fb-plan__card-text">{plan.active.plan.description}</p>
          )}
          <div className="fb-plan__dates">
            <div className="fb-plan__date">
              <span className="fb-plan__date-label">Início</span>
              <span className="fb-plan__date-value">{formatLocalDate(plan.active.startDate)}</span>
            </div>
            <div className="fb-plan__date">
              <span className="fb-plan__date-label">Término</span>
              <span className="fb-plan__date-value">{formatLocalDate(plan.active.endDate)}</span>
            </div>
          </div>
        </section>
      )}

      {plan && !plan.active && (
        <div className="fb-plan__empty">
          Você não tem um plano ativo no momento. Fale com a recepção do Fitburn para contratar um
          plano.
        </div>
      )}

      {plan && (
        <section className="fb-plan__history" aria-labelledby="fb-plan-history">
          <h2 id="fb-plan-history" className="fb-plan__history-title">
            Histórico de planos
          </h2>
          {plan.history.length === 0 ? (
            <p className="fb-plan__none">Nenhum plano anterior.</p>
          ) : (
            <ul className="fb-plan__history-list">
              {plan.history.map((item) => (
                <HistoryItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
