import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BIOIMPEDANCE_SOURCE_LABELS,
  Module,
  PermissionAction,
  measureDefinition,
  type AssessmentsHiddenReasonName,
  type BioimpedanceAssessment,
} from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";
import { useAuth } from "../../lib/auth/AuthContext";
import { useClientAssessments, useDeleteAssessment } from "../../lib/bioimpedance/assessments-api";
import { resolveMeasure, type EvolutionPeriod } from "../../lib/bioimpedance/evolution";
import {
  formatMeasure,
  previousOf,
  sortAssessments,
  variation,
} from "../../lib/bioimpedance/summary";
import { AssessmentAction } from "../bioimpedance/AssessmentAction";
import { formatMeasuredAt } from "../bioimpedance/BioimpedanceAdminPage";
import { Evolution } from "../bioimpedance/BioimpedanceEvolution";
import { VariationText, formatDate } from "../bioimpedance/bioimpedanceParts";
import { ConfirmDeleteDialog } from "../shop/ConfirmDeleteDialog";

/** Os quatro indicadores do topo da aba (proposta aprovada em `docs/design/proposta-bioimpedancia.html`). */
const KPI_KEYS = ["weight", "skeletalMuscleMass", "bodyFatPercent", "inbodyScore"] as const;

/** Por que a equipe não vê as avaliações (D-042). A aba mostra só o motivo, nunca os dados. */
const HIDDEN_REASON: Record<AssessmentsHiddenReasonName, { title: string; description: string }> = {
  CONSENT_REVOKED: {
    title: "O cliente desligou o registro da bioimpedância.",
    description:
      "Enquanto a autorização estiver desligada, a equipe não vê as avaliações dele. O cliente continua vendo e pode excluir as dele.",
  },
  CONSENT_MISSING: {
    title: "O cliente ainda não autorizou o registro da bioimpedância.",
    description:
      "Peça para a pessoa ligar em Perfil › Privacidade no app. Sem a autorização não há avaliações para mostrar.",
  },
};

/**
 * Aba "Bioimpedância" do detalhe do cliente (B7): KPIs da última avaliação, a mesma evolução que o cliente vê e a lista
 * de avaliações com Editar e Excluir, conforme as permissões do módulo. Quem chega aqui já tem Ver. Editar reabre o
 * formulário da B2 e volta para esta aba; excluir é físico, com confirmação, e fica na auditoria sem os valores.
 * Com o consentimento revogado ou ausente a API devolve a lista vazia com o motivo, e a aba mostra só o motivo.
 */
export function ClientBioimpedanceTab({ clientId }: { clientId: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const query = useClientAssessments(clientId, true);
  const deleteMutation = useDeleteAssessment();
  const [deleting, setDeleting] = useState<BioimpedanceAssessment | null>(null);
  const [measureKey, setMeasureKey] = useState("weight");
  const [period, setPeriod] = useState<EvolutionPeriod>("all");
  const [now] = useState(() => new Date());

  const canEdit = can(Module.BIOIMPEDANCIA, PermissionAction.EDIT);
  const canDelete = can(Module.BIOIMPEDANCIA, PermissionAction.DELETE);

  const data = query.data;
  const sorted = sortAssessments(data?.items ?? []);
  const latest = sorted[0];
  const previous = latest ? previousOf(sorted, latest) : undefined;

  return (
    <div className="fb-ui-stack">
      <QueryBlockState
        query={query}
        hasData={data !== undefined}
        loading="Carregando bioimpedância…"
        error="Não foi possível carregar a bioimpedância."
      />

      {data?.hiddenReason && (
        <Card>
          <EmptyState
            title={HIDDEN_REASON[data.hiddenReason].title}
            description={HIDDEN_REASON[data.hiddenReason].description}
          />
        </Card>
      )}

      {data && !data.hiddenReason && sorted.length === 0 && (
        <Card>
          <EmptyState
            title="Nenhuma avaliação registrada."
            description="Quando a equipe registrar a bioimpedância deste cliente, os valores e a evolução aparecem aqui."
          />
        </Card>
      )}

      {latest && (
        <>
          <ul className="fb-bio-metrics fb-client-bio__kpis" aria-label="Resumo da última avaliação">
            {KPI_KEYS.filter((key) => latest.measures[key]).map((key) => (
              <li key={key} className="fb-bio-metric">
                <span className="fb-bio-metric__label">{measureDefinition(key)?.label}</span>
                <strong className="fb-bio-metric__value">{formatMeasure(key, latest.measures[key])}</strong>
                {previous && <VariationText metricKey={key} change={variation(key, latest, previous)} />}
              </li>
            ))}
          </ul>

          <div className="fb-client-bio__grid">
            <Card as="section" className="fb-ui-stack" aria-labelledby="client-bio-evolution">
              <h2 id="client-bio-evolution" className="fb-ui-section-title">
                Evolução
              </h2>
              <Evolution
                items={sorted}
                definition={resolveMeasure(measureKey)}
                period={period}
                now={now}
                onMeasure={setMeasureKey}
                onPeriod={setPeriod}
              />
            </Card>

            <Card as="section" className="fb-ui-stack" aria-labelledby="client-bio-list">
              <h2 id="client-bio-list" className="fb-ui-section-title">
                Avaliações
              </h2>
              <ul className="fb-ui-rows" aria-label="Avaliações do cliente">
                {sorted.map((assessment) => {
                  const when = formatMeasuredAt(assessment.measuredAt);
                  return (
                    <li key={assessment.id}>
                      <span>
                        <strong>{when}</strong>
                        <br />
                        {BIOIMPEDANCE_SOURCE_LABELS[assessment.source]} · {assessment.authorName}
                      </span>
                      <span className="fb-ui-row-actions">
                        <AssessmentAction allowed={canEdit} reason="Você não tem permissão para editar avaliações.">
                          <Button
                            size="sm"
                            aria-label={`Editar avaliação de ${when}`}
                            onClick={() =>
                              void navigate(`/bioimpedancia-admin/${assessment.id}/editar`, {
                                state: { from: `/clientes/${clientId}?aba=bioimpedancia` },
                              })
                            }
                          >
                            Editar
                          </Button>
                        </AssessmentAction>
                        <AssessmentAction allowed={canDelete} reason="Você não tem permissão para excluir avaliações.">
                          <Button
                            size="sm"
                            variant="ghost-danger"
                            aria-label={`Excluir avaliação de ${when}`}
                            onClick={() => setDeleting(assessment)}
                          >
                            Excluir
                          </Button>
                        </AssessmentAction>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </>
      )}

      {deleting && (
        <ConfirmDeleteDialog
          title={`Excluir a avaliação de ${formatDate(deleting.measuredAt)}?`}
          description="A exclusão é definitiva: os valores são apagados e não podem ser recuperados. A ação fica registrada na auditoria, sem os valores."
          fallbackError="Não foi possível excluir a avaliação."
          onConfirm={() => deleteMutation.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
