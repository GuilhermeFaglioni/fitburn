import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MEASURE_RATING_LABELS,
  measureDefinition,
  type BioimpedanceAssessment,
} from "@fitburn/contracts";
import { errorMessage } from "../../lib/auth/api";
import { useMyAssessments, useDeleteMyAssessment } from "../../lib/bioimpedance/assessments-api";
import {
  resolveMeasure,
  resolvePeriod,
  resolveSegmentKind,
  type EvolutionPeriod,
  type SegmentKind,
} from "../../lib/bioimpedance/evolution";
import {
  SUMMARY_METRIC_KEYS,
  WEIGHT_CONTROL_KEYS,
  formatMeasure,
  formatNumber,
  formatRange,
  markerPosition,
  previousOf,
  ratingOf,
  sortAssessments,
  valueGroups,
  variation,
} from "../../lib/bioimpedance/summary";
import { useBioimpedanceConsent } from "../../lib/bioimpedance/useBioimpedanceConsent";
import { useOnline } from "../../lib/connectivity/useOnline";
import { QueryBlockState } from "../../components/QueryBlockState";
import { RequiresNetwork } from "../../components/RequiresNetwork";
import { Accordion } from "../../components/ui/Accordion";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Segmented";
import { Select } from "../../components/ui/Select";
import { ConfirmDeleteDialog } from "../shop/ConfirmDeleteDialog";
import { formatMeasuredAt } from "./BioimpedanceAdminPage";
import { Evolution } from "./BioimpedanceEvolution";
import { Segmental } from "./BioimpedanceSegmental";
import { VariationText, formatDate } from "./bioimpedanceParts";

type Tab = "resumo" | "evolucao" | "segmentar" | "valores";
const TABS = [
  { value: "resumo", label: "Resumo" },
  { value: "evolucao", label: "Evolução" },
  { value: "segmentar", label: "Segmentar" },
  { value: "valores", label: "Valores" },
] as const;

function Summary({
  assessment,
  previous,
  single,
}: {
  assessment: BioimpedanceAssessment;
  previous: BioimpedanceAssessment | undefined;
  single: boolean;
}) {
  const score = assessment.measures.inbodyScore;
  const scoreChange = variation("inbodyScore", assessment, previous);
  const control = WEIGHT_CONTROL_KEYS.filter((key) => assessment.measures[key]);
  return (
    <>
      {single && (
        <p className="fb-bio__copy">
          A evolução aparece a partir da segunda avaliação. Sua primeira foi em{" "}
          {formatDate(assessment.measuredAt)}.
        </p>
      )}
      {score && (
        <Card as="section" flat className="fb-bio__card" aria-label="Pontuação InBody">
          <p className="fb-bio-score">
            <strong>{formatNumber(score.value)}</strong>
            <span> /100 · pontuação InBody</span>
          </p>
          {previous && scoreChange && (
            <p className="fb-bio__copy">
              {scoreChange.trend === "same"
                ? `Igual à de ${formatDate(previous.measuredAt)}`
                : `${scoreChange.trend === "up" ? "+" : "−"}${formatNumber(scoreChange.amount)} pontos desde ${formatDate(previous.measuredAt)}`}
            </p>
          )}
        </Card>
      )}
      <ul className="fb-bio-metrics" aria-label="Métricas da avaliação">
        {SUMMARY_METRIC_KEYS.filter((key) => assessment.measures[key]).map((key) => (
          <li key={key} className="fb-bio-metric">
            <span className="fb-bio-metric__label">{measureDefinition(key)?.label}</span>
            <strong className="fb-bio-metric__value">
              {formatMeasure(key, assessment.measures[key])}
            </strong>
            {!single && (
              <VariationText metricKey={key} change={variation(key, assessment, previous)} />
            )}
          </li>
        ))}
      </ul>
      {control.length > 0 && (
        <Card as="section" flat className="fb-bio__card" aria-labelledby="fb-bio-control">
          <h2 id="fb-bio-control" className="fb-bio__subtitle">
            Controle de peso
          </h2>
          <dl className="fb-bio-control">
            {control.map((key) => (
              <div key={key}>
                <dt>{measureDefinition(key)?.label}</dt>
                <dd>{formatSigned(key, assessment.measures[key]?.value ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <p className="fb-bio__copy">
        Registrada por {assessment.authorName} · InBody120. Os resultados não substituem orientação
        profissional.
      </p>
    </>
  );
}

function formatSigned(key: string, value: number): string {
  const unit = measureDefinition(key)?.unit ?? "";
  const sign = key === "targetWeight" ? "" : value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value))} ${unit}`.trim();
}

function Values({ assessment }: { assessment: BioimpedanceAssessment }) {
  const groups = valueGroups(assessment);
  return (
    <Accordion
      items={groups.map((entry, index) => ({
        id: entry.group,
        title: entry.label,
        defaultOpen: index === 0,
        content: (
          <ul className="fb-bio-values">
            {entry.rows.map(({ definition, measure }) => {
              const rating = ratingOf(measure);
              const position = markerPosition(measure);
              const range = formatRange(measure);
              return (
                <li key={definition.key} className="fb-bio-value">
                  <div className="fb-bio-value__head">
                    <span>{definition.label}</span>
                    <strong>
                      {formatNumber(measure.value)}
                      {definition.unit ? ` ${definition.unit}` : ""}
                    </strong>
                  </div>
                  {range && <span className="fb-bio__copy">Faixa normal: {range}</span>}
                  {position !== null && rating && (
                    <div
                      className="fb-bio-bar"
                      role="img"
                      aria-label={`${definition.label}: ${MEASURE_RATING_LABELS[rating]}`}
                    >
                      <i className="fb-bio-bar__marker" style={{ left: `${position}%` }} />
                    </div>
                  )}
                  {rating && (
                    <span className="fb-bio-bar__labels" aria-hidden="true">
                      <span>Abaixo</span>
                      <span>Normal</span>
                      <span>Acima</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ),
      }))}
    />
  );
}

/**
 * Composição corporal (`/bioimpedancia`). Sem avaliação, mostra a autorização (D-042) ou o aviso de nenhuma avaliação.
 * Com avaliações, abas Resumo e Valores (`?aba=`), seletor de avaliação (`?avaliacao=`) e exclusão das próprias com
 * confirmação. Depois de revogar a autorização o cliente continua vendo e excluindo as dele (D-042).
 */
export function BioimpedancePage() {
  const navigate = useNavigate();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const { query: consentQuery, mutation } = useBioimpedanceConsent();
  const mine = useMyAssessments();
  const deleteMutation = useDeleteMyAssessment();
  const [deleting, setDeleting] = useState<BioimpedanceAssessment | null>(null);

  const consent = consentQuery.data;
  const sorted = sortAssessments(mine.data ?? []);
  const selected = sorted.find((item) => item.id === params.get("avaliacao")) ?? sorted[0];
  const abaParam = params.get("aba");
  const tab: Tab = TABS.some((item) => item.value === abaParam) ? (abaParam as Tab) : "resumo";
  const measure = resolveMeasure(params.get("medida"));
  const period = resolvePeriod(params.get("periodo"));
  const segmentKind = resolveSegmentKind(params.get("tipo"));
  const [now] = useState(() => new Date());

  function update(next: {
    aba?: Tab;
    avaliacao?: string;
    medida?: string;
    periodo?: EvolutionPeriod;
    tipo?: SegmentKind;
  }) {
    const copy = new URLSearchParams(params);
    if (next.aba) {
      if (next.aba === "resumo") copy.delete("aba");
      else copy.set("aba", next.aba);
    }
    if (next.avaliacao) copy.set("avaliacao", next.avaliacao);
    if (next.medida) copy.set("medida", next.medida);
    if (next.periodo) {
      if (next.periodo === "all") copy.delete("periodo");
      else copy.set("periodo", next.periodo);
    }
    if (next.tipo) {
      if (next.tipo === "lean") copy.delete("tipo");
      else copy.set("tipo", "gordura");
    }
    setParams(copy, { replace: true });
  }

  const hasAssessments = mine.data !== undefined && sorted.length > 0;

  return (
    <div className="fb-bio">
      <h1 className="fb-bio__title">Composição corporal</h1>

      <QueryBlockState
        query={mine}
        loading="Carregando…"
        error="Não foi possível carregar suas avaliações."
        hasData={mine.data !== undefined}
      />

      {mine.data !== undefined && !hasAssessments && (
        <>
          <QueryBlockState
            query={consentQuery}
            loading="Carregando…"
            error="Não foi possível carregar sua autorização de bioimpedância."
            hasData={consent !== undefined}
          />
          {consent && !consent.consented && (
            <Card as="section" flat className="fb-bio__card" aria-labelledby="fb-bio-consent-title">
              <h2 id="fb-bio-consent-title" className="fb-bio__subtitle">
                Acompanhe sua evolução
              </h2>
              <p className="fb-bio__copy">
                Quando você faz a bioimpedância na Fitburn, a equipe pode registrar os resultados
                aqui: peso, massa muscular, gordura, água e a análise por segmento do corpo.
              </p>
              <ul className="fb-bio__list">
                <li>Guardamos só os valores, não a imagem do laudo.</li>
                <li>Você e a equipe da Fitburn veem os dados. Ninguém mais.</li>
                <li>Você pode desligar quando quiser, no Perfil.</li>
              </ul>
              <Link to="/privacidade" className="fb-bio__link">
                Ler a política de privacidade
              </Link>
              {mutation.isError && (
                <Alert>
                  {errorMessage(mutation.error, "Não foi possível registrar sua autorização.")}
                </Alert>
              )}
              <div className="fb-bio__actions">
                <Button
                  variant="primary"
                  block
                  busy={mutation.isPending}
                  onClick={() => mutation.mutate(true)}
                >
                  Autorizar registro
                </Button>
                <Button variant="ghost" disabled={mutation.isPending} onClick={() => navigate("/")}>
                  Agora não
                </Button>
              </div>
            </Card>
          )}
          {consent?.consented && (
            <Card as="section" flat className="fb-bio__card">
              <p className="fb-bio__copy">
                Você ainda não tem avaliações registradas. Faça a bioimpedância na recepção da
                Fitburn e a equipe registra os resultados aqui.
              </p>
            </Card>
          )}
        </>
      )}

      {hasAssessments && selected && (
        <>
          {!online && (
            <p className="fb-bio__copy" role="status">
              Você está sem conexão. Mostrando a última versão salva.
            </p>
          )}
          {consent && !consent.consented && (
            <p className="fb-bio__copy">
              O registro está desligado. Você continua vendo e pode excluir as avaliações que já
              tem.
            </p>
          )}
          <Segmented
            label="Seção"
            options={TABS}
            value={tab}
            onChange={(value) => update({ aba: value })}
          />
          {tab !== "evolucao" && (
            <Select
              label="Avaliação"
              value={selected.id}
              onChange={(event) => update({ avaliacao: event.target.value })}
            >
              {sorted.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {formatMeasuredAt(item.measuredAt)}
                  {index === 0 ? " (mais recente)" : ""}
                </option>
              ))}
            </Select>
          )}

          {tab === "resumo" && (
            <Summary
              assessment={selected}
              previous={previousOf(sorted, selected)}
              single={sorted.length === 1}
            />
          )}
          {tab === "evolucao" && (
            <Evolution
              items={sorted}
              definition={measure}
              period={period}
              now={now}
              onMeasure={(key) => update({ medida: key })}
              onPeriod={(value) => update({ periodo: value })}
            />
          )}
          {tab === "segmentar" && (
            <Segmental
              assessment={selected}
              previous={previousOf(sorted, selected)}
              kind={segmentKind}
              onKind={(value) => update({ tipo: value })}
            />
          )}
          {tab === "valores" && <Values assessment={selected} />}

          {deleteMutation.isError && !deleting && (
            <Alert>
              {errorMessage(deleteMutation.error, "Não foi possível excluir a avaliação.")}
            </Alert>
          )}
          {tab !== "evolucao" && (
            <RequiresNetwork>
              <Button variant="ghost" onClick={() => setDeleting(selected)}>
                Excluir esta avaliação
              </Button>
            </RequiresNetwork>
          )}
        </>
      )}

      {deleting && (
        <ConfirmDeleteDialog
          title={`Excluir a avaliação de ${formatDate(deleting.measuredAt)}?`}
          description="A exclusão é definitiva: os valores são apagados e não podem ser recuperados."
          fallbackError="Não foi possível excluir a avaliação."
          onConfirm={() => deleteMutation.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
