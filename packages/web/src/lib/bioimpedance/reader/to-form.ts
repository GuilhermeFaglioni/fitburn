import { BIOIMPEDANCE_MEASURES, MEASURE_RATING_LABELS } from "@fitburn/contracts";
import { emptyAssessmentForm, type AssessmentFormValues } from "../../../pages/bioimpedance/assessmentForm";
import type { ReadField, ReadResult } from "./types";

/** Campo do cabeçalho do formulário (data, hora, altura, idade). */
export type HeaderKey = "date" | "time" | "heightCm" | "age";

export interface PhotoFill {
  values: AssessmentFormValues;
  /** Medidas do catálogo que o usuário deve conferir (baixa confiança, ausente na leitura). */
  checkMeasures: Set<string>;
  /** Campos do cabeçalho que o usuário deve conferir. */
  checkHeader: Set<HeaderKey>;
  /** Valores lidos com confiança. */
  readCount: number;
  /** Valores para conferir (lidos com baixa confiança ou não lidos). */
  checkCount: number;
}

const RATING_BY_LABEL = Object.fromEntries(Object.entries(MEASURE_RATING_LABELS).map(([code, label]) => [label, code]));
const MEASURES = new Map(BIOIMPEDANCE_MEASURES.map((definition) => [definition.key, definition]));

function numberText(value: number | string): string {
  return String(value).replace(".", ",");
}

/**
 * Converte a leitura do laudo em valores do formulário. Só preenche o que foi lido; qualquer campo que não for `ok`
 * entra em "para conferir". Campos que o layout não imprime (`missing`) não contam: não há o que conferir.
 */
export function readResultToForm(result: ReadResult): PhotoFill {
  const values = emptyAssessmentForm();
  const checkMeasures = new Set<string>();
  const checkHeader = new Set<HeaderKey>();
  let readCount = 0;
  let checkCount = 0;

  for (const field of result.fields) {
    if (field.status === "missing") continue;
    if (field.status === "ok" && field.value !== null) readCount += 1;
    else checkCount += 1;
    const flag = field.status !== "ok" || field.value === null;
    place(field, flag, values, checkMeasures, checkHeader);
  }
  return { values, checkMeasures, checkHeader, readCount, checkCount };
}

function place(
  field: ReadField,
  flag: boolean,
  values: AssessmentFormValues,
  checkMeasures: Set<string>,
  checkHeader: Set<HeaderKey>,
): void {
  const { key, value } = field;
  const mark = (header: HeaderKey) => flag && checkHeader.add(header);

  if (key === "measuredAt") {
    mark("date");
    mark("time");
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      values.date = value.slice(0, 10);
      values.time = value.slice(11);
    }
    return;
  }
  if (key === "height" || key === "age") {
    const header: HeaderKey = key === "height" ? "heightCm" : "age";
    mark(header);
    if (typeof value === "number") {
      // A idade do laudo pode vir com decimal; o formulário guarda anos inteiros.
      const integer = key === "age" && !Number.isInteger(value);
      values[header] = integer ? String(Math.floor(value)) : numberText(value);
      if (integer) checkHeader.add(header);
    }
    return;
  }

  const direct = MEASURES.get(key);
  if (direct) {
    if (value !== null) values.measures[key]!.value = numberText(value);
    if (flag) checkMeasures.add(key);
    return;
  }
  const suffix = /(Percent|Rating)$/.exec(key)?.[1];
  const base = suffix ? key.slice(0, -suffix.length) : undefined;
  if (!suffix || !base || !MEASURES.has(base)) return;
  const draft = values.measures[base]!;
  if (suffix === "Percent" && value !== null) draft.percent = numberText(value);
  if (suffix === "Rating" && typeof value === "string") draft.rating = RATING_BY_LABEL[value] ?? "";
  if (flag) checkMeasures.add(base);
}
