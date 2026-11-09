import { useQuery } from "@tanstack/react-query";
import { gymToday } from "@fitburn/contracts";
import { formatDayMonth, formatLocalDate } from "../../lib/agenda/format";
import { getMyPlan } from "../../lib/plans/api";
import { PlanHistoryList } from "./PlanHistoryList";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";

/**
 * Plano dentro do Perfil (D-038, tela extrapolada da base): o plano ativo do cliente com o selo de situação e as
 * datas, e o histórico. Informativo: sem oferta, preço nem checkout — quem quer um plano fala com a recepção.
 * Carrega, falha e fica sem conexão sozinho (`QueryBlockState`).
 */
export function MyPlanSection() {
  const planQuery = useQuery({ queryKey: ["plans", "mine"], queryFn: getMyPlan });
  const plan = planQuery.data;
  const startsLater = plan?.active ? plan.active.startDate > gymToday() : false;

  return (
    <Card as="section" flat className="fb-profile__card fb-plan" aria-labelledby="fb-plan-title">
      <h2 id="fb-plan-title" className="fb-plan__title">
        Meu plano
      </h2>

      <QueryBlockState
        query={planQuery}
        loading="Carregando…"
        error="Não foi possível carregar o seu plano."
        hasData={plan !== undefined}
      />

      {plan?.active && (
        <Card as="section" selected className="fb-plan__current" aria-label="Plano ativo">
          <div className="fb-plan__current-head">
            <span className="fb-plan__current-name">{plan.active.plan.name}</span>
            <Badge tone={startsLater ? "brand" : "ok"} dot={!startsLater}>
              {startsLater ? `Começa em ${formatDayMonth(plan.active.startDate)}` : "ATIVO"}
            </Badge>
          </div>
          {plan.active.plan.description && (
            <p className="fb-plan__current-text">{plan.active.plan.description}</p>
          )}
          <dl className="fb-plan__dates">
            <div className="fb-plan__date">
              <dt className="fb-plan__date-label">Início</dt>
              <dd className="fb-plan__date-value">{formatLocalDate(plan.active.startDate)}</dd>
            </div>
            <div className="fb-plan__date">
              <dt className="fb-plan__date-label">Término</dt>
              <dd className="fb-plan__date-value">{formatLocalDate(plan.active.endDate)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {plan && !plan.active && (
        <EmptyState title="Você não tem um plano ativo no momento. Fale com a recepção do Fitburn para contratar um plano." />
      )}

      {plan && (
        <section className="fb-plan__history" aria-labelledby="fb-plan-history">
          <h3 id="fb-plan-history" className="fb-plan__history-title">
            Histórico de planos
          </h3>
          {plan.history.length === 0 ? (
            <p className="fb-plan__none">Nenhum plano anterior.</p>
          ) : (
            <PlanHistoryList items={plan.history} />
          )}
        </section>
      )}
    </Card>
  );
}
