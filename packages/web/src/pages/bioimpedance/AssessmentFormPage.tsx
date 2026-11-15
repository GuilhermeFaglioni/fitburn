import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BIOIMPEDANCE_GROUP_LABELS,
  BIOIMPEDANCE_GROUP_ORDER,
  MEASURE_RATING_LABELS,
  Module,
  PermissionAction,
  flaggedMeasureKeys,
  measuresOfGroup,
  type AssessmentClient,
  type MeasureDefinition,
} from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  useAssessment,
  useAssessmentClients,
  useCreateAssessment,
  useUpdateAssessment,
} from "../../lib/bioimpedance/assessments-api";
import { AssessmentAction } from "./AssessmentAction";
import {
  assessmentToForm,
  buildCreateRequest,
  buildUpdateRequest,
  checksFor,
  emptyAssessmentForm,
  fieldLabel,
  type AssessmentFormErrors,
  type AssessmentFormValues,
  type MeasureDraft,
} from "./assessmentForm";

const FORM_ID = "assessment-form";
const LIST_PATH = "/bioimpedancia-admin";

function Crumb({ current }: { current: string }) {
  return (
    <>
      <Link to={LIST_PATH} className="fb-ui-link">
        Bioimpedância
      </Link>{" "}
      / {current}
    </>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="fb-bio-steps" aria-label="Etapas">
      <li aria-current={step === 1 ? "step" : undefined}>1 Cliente e arquivo</li>
      <li aria-current={step === 2 ? "step" : undefined}>2 Conferir valores</li>
    </ol>
  );
}

function formatConsentDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

/** Passo 1: escolher o cliente. Sem consentimento vigente (D-042), o avanço fica bloqueado, com o motivo e a orientação. */
function ClientStep({ onContinue }: { onContinue: (client: AssessmentClient) => void }) {
  const clientsQuery = useAssessmentClients();
  const [clientId, setClientId] = useState("");
  const clients = clientsQuery.data ?? [];
  const selected = clients.find((client) => client.id === clientId);

  return (
    <Card as="section" aria-labelledby="assessment-client" className="fb-ui-card--form">
      <h2 id="assessment-client" className="fb-ui-section-title">
        Cliente e arquivo
      </h2>
      <div className="fb-ui-stack fb-shop-card-body">
        <QueryBlockState
          query={clientsQuery}
          hasData={clientsQuery.data !== undefined}
          loading="Carregando clientes…"
          error="Não foi possível carregar os clientes."
        />
        <Select label="Cliente" value={clientId} onChange={(event) => setClientId(event.target.value)}>
          <option value="">Selecione um cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.fullName}
            </option>
          ))}
        </Select>
        {selected?.consented && selected.consentedAt && (
          <p className="fb-ui-note">Autorizou o registro em {formatConsentDate(selected.consentedAt)}.</p>
        )}
        {selected && !selected.consented && (
          <Alert>
            {selected.fullName} ainda não autorizou o registro da bioimpedância. Peça para a pessoa ligar em Perfil ›
            Privacidade no app.
          </Alert>
        )}
        <p className="fb-ui-note">
          Nesta etapa a avaliação é digitada à mão, no mesmo formulário que receberá a leitura da foto do laudo.
        </p>
        <div>
          <Button
            variant="primary"
            disabled={!selected?.consented}
            title={selected && !selected.consented ? "O cliente ainda não autorizou o registro." : undefined}
            onClick={() => selected && onContinue(selected)}
          >
            Preencher manualmente
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MeasureRow({
  definition,
  draft,
  errors,
  flagged,
  onChange,
}: {
  definition: MeasureDefinition;
  draft: MeasureDraft;
  errors: AssessmentFormErrors;
  flagged: boolean;
  onChange: (patch: Partial<MeasureDraft>) => void;
}) {
  const base = fieldLabel(definition);
  const err = (field: string) => errors[`${definition.key}.${field}`];
  const decimal = { inputMode: "decimal" as const, autoComplete: "off" };
  return (
    <div className={flagged ? "fb-bio-measure fb-bio-measure--flag" : "fb-bio-measure"}>
      <Field
        {...decimal}
        label={base}
        value={draft.value}
        error={err("value")}
        help={flagged ? "Conferir" : undefined}
        onChange={(event) => onChange({ value: event.target.value })}
      />
      {definition.hasPercent && (
        <Field
          {...decimal}
          label={`${base}: % do ideal`}
          value={draft.percent}
          error={err("percent")}
          onChange={(event) => onChange({ percent: event.target.value })}
        />
      )}
      {definition.hasRange && (
        <>
          <Field
            {...decimal}
            label={`${base}: faixa mínima`}
            value={draft.rangeMin}
            error={err("rangeMin")}
            onChange={(event) => onChange({ rangeMin: event.target.value })}
          />
          <Field
            {...decimal}
            label={`${base}: faixa máxima`}
            value={draft.rangeMax}
            error={err("rangeMax")}
            onChange={(event) => onChange({ rangeMax: event.target.value })}
          />
        </>
      )}
      {definition.hasClassification && (
        <Select
          label={`${base}: avaliação`}
          value={draft.rating}
          onChange={(event) => onChange({ rating: event.target.value })}
        >
          <option value="">Sem avaliação</option>
          {Object.entries(MEASURE_RATING_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

/**
 * Nova avaliação (2 passos) e correção de uma avaliação salva: cliente (com bloqueio sem consentimento), depois o
 * formulário completo, agrupado como no laudo. As checagens (soma, PGC, IMC, MLG, limites) marcam "conferir"
 * enquanto se digita; nada é salvo antes de "Salvar avaliação". Gravar exige a permissão do módulo e rede.
 */
export function AssessmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id !== undefined;
  const { can } = useAuth();
  const navigate = useNavigate();
  const assessmentQuery = useAssessment(id);
  const createMutation = useCreateAssessment();
  const updateMutation = useUpdateAssessment();

  const [client, setClient] = useState<AssessmentClient | null>(null);
  const [draftValues, setDraftValues] = useState<AssessmentFormValues>(emptyAssessmentForm);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<AssessmentFormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Edição: o formulário é preenchido uma vez, quando a avaliação chega.
  const loaded = assessmentQuery.data;
  if (editing && loaded && loadedFor !== loaded.id) {
    setLoadedFor(loaded.id);
    setDraftValues(assessmentToForm(loaded));
  }

  const issues = useMemo(() => checksFor(draftValues), [draftValues]);
  const flagged = useMemo(() => flaggedMeasureKeys(issues), [issues]);

  const canSave = can(Module.BIOIMPEDANCIA, editing ? PermissionAction.EDIT : PermissionAction.CREATE);
  const saving = createMutation.isPending || updateMutation.isPending;
  const title = editing ? "Editar avaliação" : "Nova avaliação";
  const blockedReason = `Você não tem permissão para ${editing ? "editar" : "registrar"} avaliações.`;

  function setHeader(key: "date" | "time" | "heightCm" | "age", value: string) {
    setDraftValues((current) => ({ ...current, [key]: value }));
  }

  function setMeasure(key: string, patch: Partial<MeasureDraft>) {
    setDraftValues((current) => ({
      ...current,
      measures: { ...current.measures, [key]: { ...current.measures[key]!, ...patch } },
    }));
  }

  function goBack() {
    void navigate(LIST_PATH);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setApiError(null);
    const onError = (error: unknown) => setApiError(errorMessage(error, "Não foi possível salvar a avaliação."));
    if (editing && loaded) {
      const result = buildUpdateRequest(draftValues);
      if (!result.ok) return setErrors(result.errors);
      setErrors({});
      updateMutation.mutate({ id: loaded.id, input: result.data }, { onSuccess: goBack, onError });
    } else if (client) {
      const result = buildCreateRequest(draftValues, client.id);
      if (!result.ok) return setErrors(result.errors);
      setErrors({});
      createMutation.mutate(result.data, { onSuccess: goBack, onError });
    }
  }

  if (!editing && !client) {
    return (
      <div className="fb-ui-page">
        <PageHeader crumb={<Crumb current={title} />} kicker="Bioimpedância" title={title} />
        <Steps step={1} />
        <ClientStep onContinue={setClient} />
      </div>
    );
  }

  const clientName = editing ? loaded?.clientName : client?.fullName;

  return (
    <div className="fb-ui-page">
      <PageHeader
        crumb={<Crumb current={title} />}
        kicker="Bioimpedância"
        title={title}
        actions={
          <>
            {editing ? (
              <Button size="sm" disabled={saving} onClick={goBack}>
                Cancelar
              </Button>
            ) : (
              <Button size="sm" disabled={saving} onClick={() => setClient(null)}>
                Voltar
              </Button>
            )}
            <AssessmentAction allowed={canSave} reason={blockedReason}>
              <Button type="submit" form={FORM_ID} variant="primary" size="sm" busy={saving}>
                Salvar avaliação
              </Button>
            </AssessmentAction>
          </>
        }
      />
      {!editing && <Steps step={2} />}

      {editing && (
        <QueryBlockState
          query={assessmentQuery}
          hasData={loaded !== undefined}
          loading="Carregando avaliação…"
          error="Não foi possível carregar a avaliação."
        />
      )}

      {apiError && <Alert>{apiError}</Alert>}
      {!canSave && <p className="fb-ui-note">{blockedReason}</p>}

      {(!editing || loaded) && (
        <form id={FORM_ID} noValidate aria-label={title} onSubmit={submit}>
          <fieldset disabled={!canSave} className="fb-shop-fieldset fb-ui-stack">
            {clientName && (
              <p className="fb-bio-client">
                Cliente: <strong>{clientName}</strong>
              </p>
            )}
            {issues.length > 0 && (
              <div role="status" aria-label="Checagens da avaliação" className="fb-bio-checks">
                <p>
                  <strong>{flagged.size === 1 ? "1 campo para conferir" : `${flagged.size} campos para conferir`}</strong>
                </p>
                <ul>
                  {issues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <Card as="section" aria-labelledby="assessment-header" className="fb-ui-card--form">
              <h2 id="assessment-header" className="fb-ui-section-title">
                InBody
              </h2>
              <div className="fb-ui-form-grid fb-shop-card-body">
                <Field
                  label="Data da avaliação"
                  type="date"
                  value={draftValues.date}
                  error={errors.date}
                  onChange={(event) => setHeader("date", event.target.value)}
                />
                <Field
                  label="Hora da avaliação"
                  type="time"
                  value={draftValues.time}
                  error={errors.time}
                  onChange={(event) => setHeader("time", event.target.value)}
                />
                <Field
                  label="Altura (cm)"
                  inputMode="decimal"
                  value={draftValues.heightCm}
                  error={errors.heightCm}
                  onChange={(event) => setHeader("heightCm", event.target.value)}
                />
                <Field
                  label="Idade"
                  inputMode="numeric"
                  value={draftValues.age}
                  error={errors.age}
                  onChange={(event) => setHeader("age", event.target.value)}
                />
              </div>
            </Card>

            {BIOIMPEDANCE_GROUP_ORDER.map((group) => (
              <Card as="section" key={group} aria-labelledby={`assessment-${group}`} className="fb-ui-card--form">
                <h2 id={`assessment-${group}`} className="fb-ui-section-title">
                  {BIOIMPEDANCE_GROUP_LABELS[group]}
                </h2>
                <div className="fb-ui-stack fb-shop-card-body">
                  {measuresOfGroup(group).map((definition) => (
                    <MeasureRow
                      key={definition.key}
                      definition={definition}
                      draft={draftValues.measures[definition.key]!}
                      errors={errors}
                      flagged={flagged.has(definition.key)}
                      onChange={(patch) => setMeasure(definition.key, patch)}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </fieldset>
        </form>
      )}
    </div>
  );
}
