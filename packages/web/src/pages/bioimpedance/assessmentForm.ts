import {
  assessmentMeasuresSchema,
  BIOIMPEDANCE_MEASURES,
  BioimpedanceGroup,
  checkAssessment,
  createAssessmentRequestSchema,
  gymDateTimeToUtc,
  utcToGymDateTime,
  type AssessmentCheckIssue,
  type BioimpedanceAssessment,
  type CreateAssessmentRequest,
  type MeasureDefinition,
  type MeasureValue,
  type UpdateAssessmentRequest,
} from "@fitburn/contracts";

/** Campos de uma medida no formulário; tudo texto digitado (vírgula decimal aceita). */
export interface MeasureDraft {
  value: string;
  percent: string;
  rangeMin: string;
  rangeMax: string;
  rating: string;
}

export interface AssessmentFormValues {
  date: string;
  time: string;
  heightCm: string;
  age: string;
  measures: Record<string, MeasureDraft>;
}

/** Erros por campo: "date", "time", "heightCm", "age" ou "<medida>.<campo>". */
export type AssessmentFormErrors = Record<string, string>;

const EMPTY_DRAFT: MeasureDraft = { value: "", percent: "", rangeMin: "", rangeMax: "", rating: "" };

export function emptyAssessmentForm(): AssessmentFormValues {
  return {
    date: "",
    time: "",
    heightCm: "",
    age: "",
    measures: Object.fromEntries(BIOIMPEDANCE_MEASURES.map((m) => [m.key, { ...EMPTY_DRAFT }])),
  };
}

function numberText(value: number | undefined): string {
  return value === undefined ? "" : String(value).replace(".", ",");
}

export function assessmentToForm(assessment: BioimpedanceAssessment): AssessmentFormValues {
  const { date, time } = utcToGymDateTime(assessment.measuredAt);
  const form = emptyAssessmentForm();
  form.date = date;
  form.time = time;
  form.heightCm = numberText(assessment.heightCm ?? undefined);
  form.age = assessment.age === null ? "" : String(assessment.age);
  for (const definition of BIOIMPEDANCE_MEASURES) {
    const stored = assessment.measures[definition.key];
    if (!stored) continue;
    form.measures[definition.key] = {
      value: numberText(stored.value),
      percent: numberText(stored.percent),
      rangeMin: numberText(stored.rangeMin),
      rangeMax: numberText(stored.rangeMax),
      rating: stored.rating ?? "",
    };
  }
  return form;
}

/** Número digitado ("69,2" ou "69.2"); vazio é `undefined` e texto inválido é `NaN`. */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function isFilled(draft: MeasureDraft): boolean {
  return Object.values(draft).some((text) => text.trim() !== "");
}

/** Medidas digitadas em formato da API; campos em branco ficam de fora e texto inválido vira NaN (a validação aponta). */
function draftsToMeasures(drafts: Record<string, MeasureDraft>): Record<string, Record<string, unknown>> {
  const measures: Record<string, Record<string, unknown>> = {};
  for (const definition of BIOIMPEDANCE_MEASURES) {
    const draft = drafts[definition.key];
    if (!draft || !isFilled(draft)) continue;
    const entry: Record<string, unknown> = {};
    const value = parseNumber(draft.value);
    entry.value = value; // `undefined` aqui vira "informe o valor" na validação
    const percent = parseNumber(draft.percent);
    if (percent !== undefined) entry.percent = percent;
    const rangeMin = parseNumber(draft.rangeMin);
    if (rangeMin !== undefined) entry.rangeMin = rangeMin;
    const rangeMax = parseNumber(draft.rangeMax);
    if (rangeMax !== undefined) entry.rangeMax = rangeMax;
    if (draft.rating) entry.rating = draft.rating;
    measures[definition.key] = entry;
  }
  return measures;
}

export type BuildResult<T> = { ok: true; data: T } | { ok: false; errors: AssessmentFormErrors };

function collectErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  values: AssessmentFormValues,
): AssessmentFormErrors {
  const errors: AssessmentFormErrors = {};
  for (const issue of issues) {
    const path = issue.path.map(String);
    let key: string;
    if (path[0] === "measures" && path[1]) {
      const field = path[2] ?? "value";
      key = `${path[1]}.${field}`;
      // "Required"/"Invalid input" do zod chegam em inglês: troca pela mensagem do campo.
      if (path.length < 3) {
        key = `${path[1]}.value`;
      }
    } else if (path[0] === "measuredAt") {
      key = values.date.trim() === "" ? "date" : values.time.trim() === "" ? "time" : "date";
    } else {
      key = path[0] ?? "form";
    }
    errors[key] ??= issue.message;
  }
  return errors;
}

function parseHeader(values: AssessmentFormValues) {
  const errors: AssessmentFormErrors = {};
  const heightCm = parseNumber(values.heightCm);
  const age = parseNumber(values.age);
  if (Number.isNaN(heightCm)) errors.heightCm = "Informe a altura em centímetros.";
  if (Number.isNaN(age)) errors.age = "Informe a idade em anos.";
  if (values.date.trim() === "") errors.date = "Informe a data da avaliação.";
  if (values.time.trim() === "") errors.time = "Informe a hora da avaliação.";
  const measuredAt =
    values.date && values.time ? gymDateTimeToUtc(values.date, values.time).toISOString() : undefined;
  return { errors, heightCm, age, measuredAt };
}

function measureErrors(values: AssessmentFormValues): AssessmentFormErrors {
  const errors: AssessmentFormErrors = {};
  for (const definition of BIOIMPEDANCE_MEASURES) {
    const draft = values.measures[definition.key];
    if (!draft) continue;
    for (const field of ["value", "percent", "rangeMin", "rangeMax"] as const) {
      if (Number.isNaN(parseNumber(draft[field]))) errors[`${definition.key}.${field}`] = "Informe um número.";
    }
    if (isFilled(draft) && draft.value.trim() === "") {
      errors[`${definition.key}.value`] = `Informe o valor de ${definition.label.toLowerCase()}.`;
    }
  }
  if (!isFilled(values.measures["weight"] ?? EMPTY_DRAFT)) {
    errors["weight.value"] = "O peso é obrigatório.";
  }
  return errors;
}

/** Valida o formulário e monta o pedido de criação (a origem é sempre manual por ora). */
export function buildCreateRequest(
  values: AssessmentFormValues,
  clientId: string,
): BuildResult<CreateAssessmentRequest> {
  const header = parseHeader(values);
  const errors = { ...header.errors, ...measureErrors(values) };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const parsed = createAssessmentRequestSchema.safeParse({
    clientId,
    measuredAt: header.measuredAt,
    heightCm: header.heightCm,
    age: header.age,
    source: "MANUAL",
    measures: draftsToMeasures(values.measures),
  });
  if (!parsed.success) return { ok: false, errors: collectErrors(parsed.error.issues, values) };
  return { ok: true, data: parsed.data };
}

/** Valida o formulário e monta a correção; `heightCm` e `age` em branco apagam o valor. */
export function buildUpdateRequest(values: AssessmentFormValues): BuildResult<UpdateAssessmentRequest> {
  const header = parseHeader(values);
  const errors = { ...header.errors, ...measureErrors(values) };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const measures = assessmentMeasuresSchema.safeParse(draftsToMeasures(values.measures));
  if (!measures.success) return { ok: false, errors: collectErrors(measures.error.issues.map((i) => ({ ...i, path: ["measures", ...i.path] })), values) };
  const request: UpdateAssessmentRequest = {
    measuredAt: header.measuredAt,
    heightCm: header.heightCm ?? null,
    age: header.age ?? null,
    measures: measures.data as UpdateAssessmentRequest["measures"],
  };
  return { ok: true, data: request };
}

/** Checagens (soma, PGC, IMC, MLG e limites) sobre o que já foi digitado. Só entram números válidos. */
export function checksFor(values: AssessmentFormValues): AssessmentCheckIssue[] {
  const measures: Record<string, Pick<MeasureValue, "value">> = {};
  for (const definition of BIOIMPEDANCE_MEASURES) {
    const value = parseNumber(values.measures[definition.key]?.value ?? "");
    if (value !== undefined && !Number.isNaN(value)) measures[definition.key] = { value };
  }
  const height = parseNumber(values.heightCm);
  return checkAssessment({
    heightCm: height === undefined || Number.isNaN(height) ? undefined : height,
    measures,
  });
}

export function fieldLabel(definition: MeasureDefinition): string {
  const unit = definition.unit ? ` (${definition.unit})` : "";
  if (definition.group === BioimpedanceGroup.SEGMENTAL_LEAN) return `${definition.label} · massa magra${unit}`;
  if (definition.group === BioimpedanceGroup.SEGMENTAL_FAT) return `${definition.label} · gordura${unit}`;
  return `${definition.label}${unit}`;
}
