import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
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
import { readReportFile, REPORT_TEMPLATE, type ReadResult } from "../../lib/bioimpedance/reader";
import { readResultToForm, type HeaderKey, type PhotoFill } from "../../lib/bioimpedance/reader/to-form";
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
function ClientStep({ onContinue }: { onContinue: (client: AssessmentClient, file: File | null) => void }) {
  const clientsQuery = useAssessmentClients();
  const [clientId, setClientId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(candidate: File | undefined) {
    if (!candidate) return;
    if (!/^image\/(jpeg|png)$/.test(candidate.type)) {
      setFile(null);
      setFileError("Escolha uma imagem JPG ou PNG do laudo.");
      return;
    }
    setFileError(null);
    setFile(candidate);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  }
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
        <div
          className={dragging ? "fb-bio-drop fb-bio-drop--active" : "fb-bio-drop"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="fb-bio-drop__title">Foto do laudo InBody</p>
          <p className="fb-ui-note">
            Arraste o JPG até aqui ou escolha o arquivo. A imagem é lida neste aparelho e não é enviada nem guardada.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="fb-bio-drop__input"
            aria-label="Arquivo do laudo"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()}>
            {file ? "Trocar arquivo" : "Escolher arquivo"}
          </Button>
          {file && <p className="fb-bio-drop__file">Arquivo: {file.name}</p>}
          {fileError && <p role="alert" className="fb-ui-help fb-ui-help--error">{fileError}</p>}
        </div>
        <div className="fb-bio-actions">
          <Button
            variant="primary"
            disabled={!selected?.consented || !file}
            title={selected && !selected.consented ? "O cliente ainda não autorizou o registro." : undefined}
            onClick={() => selected && file && onContinue(selected, file)}
          >
            Ler o laudo
          </Button>
          <Button
            disabled={!selected?.consented}
            title={selected && !selected.consented ? "O cliente ainda não autorizou o registro." : undefined}
            onClick={() => selected && onContinue(selected, null)}
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

type PhotoState =
  | { phase: "reading" }
  | { phase: "error" }
  | { phase: "done"; result: ReadResult; fill: PhotoFill };

/** Imagem do laudo (só neste navegador) com as áreas lidas: verde = lido, âmbar = conferir. */
function PhotoPanel({ url, state }: { url: string; state: PhotoState }) {
  const { width, height } = REPORT_TEMPLATE;
  return (
    <Card as="section" aria-labelledby="assessment-photo" className="fb-ui-card--form">
      <h2 id="assessment-photo" className="fb-ui-section-title">
        Laudo lido
      </h2>
      <div className="fb-ui-stack fb-shop-card-body">
        {state.phase === "reading" && (
          <p role="status" className="fb-ui-note">
            Lendo o laudo neste aparelho… na primeira vez, o leitor é baixado e pode demorar um pouco.
          </p>
        )}
        {state.phase === "error" && (
          <Alert>Não foi possível ler o laudo. Preencha os valores à mão ou volte e escolha outra foto.</Alert>
        )}
        {state.phase === "done" && !state.result.looksLikeReport && (
          <Alert>{state.result.warning ?? "Esta imagem não parece um laudo InBody."}</Alert>
        )}
        {state.phase === "done" && state.result.looksLikeReport && (
          <p role="status" className="fb-bio-summary">
            {state.fill.readCount} {state.fill.readCount === 1 ? "valor lido" : "valores lidos"}, {state.fill.checkCount}{" "}
            para conferir
          </p>
        )}
        <div className="fb-bio-photo">
          <img src={url} alt="Foto do laudo escolhida, usada só neste navegador" />
          {state.phase === "done" &&
            state.result.looksLikeReport &&
            state.result.fields
              .filter((field) => field.status !== "missing")
              .map((field) => {
                const area = REPORT_TEMPLATE.fields.find((candidate) => candidate.key === field.key);
                if (!area) return null;
                const [x0, y0, x1, y1] = area.rect;
                return (
                  <span
                    key={field.key}
                    aria-hidden="true"
                    className={field.status === "ok" ? "fb-bio-area fb-bio-area--ok" : "fb-bio-area fb-bio-area--check"}
                    style={{
                      left: `${(x0 / width) * 100}%`,
                      top: `${(y0 / height) * 100}%`,
                      width: `${((x1 - x0) / width) * 100}%`,
                      height: `${((y1 - y0) / height) * 100}%`,
                    }}
                  />
                );
              })}
        </div>
      </div>
    </Card>
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

  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [readerMeasures, setReaderMeasures] = useState<Set<string>>(new Set());
  const [readerHeader, setReaderHeader] = useState<Set<HeaderKey>>(new Set());
  const urlRef = useRef<string | null>(null);

  // A imagem só existe na memória deste navegador: o endereço temporário é revogado ao trocar ou sair.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function startReading(chosen: AssessmentClient, file: File) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPhotoUrl(urlRef.current);
    setClient(chosen);
    setPhoto({ phase: "reading" });
    try {
      const result = await readReportFile(file);
      const fill = readResultToForm(result);
      if (result.looksLikeReport) {
        setDraftValues(fill.values);
        setReaderMeasures(fill.checkMeasures);
        setReaderHeader(fill.checkHeader);
      }
      setPhoto({ phase: "done", result, fill });
    } catch {
      setPhoto({ phase: "error" });
    }
  }

  function leavePhoto() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhotoUrl(null);
    setPhoto(null);
    setReaderMeasures(new Set());
    setReaderHeader(new Set());
    setDraftValues(emptyAssessmentForm());
    setClient(null);
  }

  const issues = useMemo(() => checksFor(draftValues), [draftValues]);
  const flagged = useMemo(() => {
    const keys = flaggedMeasureKeys(issues);
    for (const key of readerMeasures) keys.add(key);
    return keys;
  }, [issues, readerMeasures]);
  const fromPhoto = photo?.phase === "done" && photo.result.looksLikeReport;
  const headerFlag = (key: HeaderKey) => (readerHeader.has(key) ? "Conferir" : undefined);

  const canSave = can(Module.BIOIMPEDANCIA, editing ? PermissionAction.EDIT : PermissionAction.CREATE);
  const saving = createMutation.isPending || updateMutation.isPending;
  const title = editing ? "Editar avaliação" : "Nova avaliação";
  const blockedReason = `Você não tem permissão para ${editing ? "editar" : "registrar"} avaliações.`;

  function setHeader(key: "date" | "time" | "heightCm" | "age", value: string) {
    setDraftValues((current) => ({ ...current, [key]: value }));
    // Conferido pelo usuário: sai da lista "para conferir" (data e hora andam juntas).
    setReaderHeader((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function setMeasure(key: string, patch: Partial<MeasureDraft>) {
    setReaderMeasures((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
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
      const result = buildCreateRequest(draftValues, client.id, fromPhoto ? "FOTO_DO_LAUDO" : "MANUAL");
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
        <ClientStep
          onContinue={(chosen, file) => {
            if (file) void startReading(chosen, file);
            else setClient(chosen);
          }}
        />
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
              <Button size="sm" disabled={saving} onClick={leavePhoto}>
                Voltar
              </Button>
            )}
            <AssessmentAction allowed={canSave} reason={blockedReason}>
              <Button type="submit" form={FORM_ID} variant="primary" size="sm" busy={saving || photo?.phase === "reading"}>
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

      {!editing && photo && photoUrl && <PhotoPanel url={photoUrl} state={photo} />}

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
                  help={headerFlag("date")}
                  onChange={(event) => setHeader("date", event.target.value)}
                />
                <Field
                  label="Hora da avaliação"
                  type="time"
                  value={draftValues.time}
                  error={errors.time}
                  help={headerFlag("time")}
                  onChange={(event) => setHeader("time", event.target.value)}
                />
                <Field
                  label="Altura (cm)"
                  inputMode="decimal"
                  value={draftValues.heightCm}
                  error={errors.heightCm}
                  help={headerFlag("heightCm")}
                  onChange={(event) => setHeader("heightCm", event.target.value)}
                />
                <Field
                  label="Idade"
                  inputMode="numeric"
                  value={draftValues.age}
                  error={errors.age}
                  help={headerFlag("age")}
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
