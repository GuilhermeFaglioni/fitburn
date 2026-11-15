import { parseDateTime, parseNumber, parseRating, normalizeText } from "./parse";
import { REPORT_HEIGHT, REPORT_TEMPLATE, REPORT_WIDTH, type Rect, type TemplateField } from "./template";
import type { OcrEngine, OcrResult, ReadField, ReadResult, ReportImage } from "./types";

/** Abaixo disso o campo vira "conferir" (confiança do tesseract por palavra, 0–100). */
export const MIN_CONFIDENCE = 60;
/** Zoom aplicado a cada recorte antes do OCR. */
const SCALE = 2;
/** Folga ao redor da área, para o OCR ter margem em branco. */
const PAD = 3;
const ASPECT = REPORT_WIDTH / REPORT_HEIGHT;
const ASPECT_TOLERANCE = 0.12;

/** Rótulos impressos na tabela de composição; um laudo tem quase todos. */
const COMPOSITION_LABELS = ["agua", "proteina", "minerais", "gordura", "peso"];
const COMPOSITION_LABELS_RECT: Rect = [58, 295, 612, 515];

/** Trecho distintivo (sem acento) de cada rótulo da coluna "Dados adicionais". */
const ANCHOR_KEYWORDS: Record<string, string> = {
  skeletalMuscleMass: "esquel",
  fatFreeMass: "livre",
  basalMetabolicRate: "basal",
  waistHipRatio: "cintura",
  visceralFatLevel: "viscer",
  obesityDegree: "obesidade",
};

/** Campos que o laudo imprime sem casa decimal. */
const INTEGER_KEYS = new Set(["height", "age", "inbodyScore", "basalMetabolicRate", "visceralFatLevel", "obesityDegree"]);

const pad = (r: Rect): Rect => [
  Math.max(0, r[0] - PAD),
  Math.max(0, r[1] - PAD),
  Math.min(REPORT_WIDTH, r[2] + PAD),
  Math.min(REPORT_HEIGHT, r[3] + PAD),
];

/** Menor confiança entre as palavras com dígito (as demais, como "kg", não pesam). */
function digitConfidence(res: OcrResult): number {
  const w = res.lines.flatMap((l) => l.words).filter((x) => /\d/.test(x.text));
  return w.length ? Math.min(...w.map((x) => x.confidence)) : 0;
}

/**
 * O número do campo dentro do texto reconhecido: o primeiro (ou o último, na faixa que
 * termina em barra + valor), com o sinal que vier antes ("- 4,9"). Letras coladas (unidade, rótulo) são ignoradas.
 */
function numberText(text: string, last: boolean): string {
  const found = [...text.replace(/[−–]/g, "-").matchAll(/([+-])?\s*(\d+(?:[.,]\d+)?)/g)];
  const m = last ? found[found.length - 1] : found[0];
  return m ? `${m[1] ?? ""}${m[2]}` : "";
}

function toField(f: TemplateField, text: string, confidence: number): ReadField {
  const base = { key: f.key, confidence, raw: text };
  let value: number | string | null;
  if (f.type === "number") value = parseNumber(text);
  else if (f.type === "datetime") value = parseDateTime(text);
  else value = parseRating(text);
  // um número sem a vírgula decimal onde o laudo sempre traz uma (ex.: "82" no lugar de "82,4")
  // é dígito perdido, não valor: conferir
  const semDecimal = f.type === "number" && !INTEGER_KEYS.has(f.key) && !/[.,]\d/.test(text);
  const status = value === null || semDecimal || confidence < MIN_CONFIDENCE ? "check" : "ok";
  return { ...base, value, status };
}

async function readOnce(image: ReportImage, ocr: OcrEngine, f: TemplateField, rect: Rect, escala: number): Promise<ReadField> {
  const res = await ocr.recognize(await image.crop(pad(rect), escala), f.type === "classification" ? "text" : "number");
  if (f.type === "classification") return toField(f, res.text, res.confidence);
  if (f.type === "datetime") return toField(f, res.text, digitConfidence(res));
  // na faixa, a barra vem antes e o número no fim dela: vale o último
  return toField(f, numberText(res.text, f.mode === "band"), digitConfidence(res));
}

/**
 * Lê a área em duas ampliações. Se as duas não concordam no valor, o campo vira "conferir":
 * um OCR que acerta num zoom e erra no outro não merece confiança (ex.: 7 lido como 1).
 */
async function readNumberLike(image: ReportImage, ocr: OcrEngine, f: TemplateField, rect: Rect): Promise<ReadField> {
  const h = rect[3] - rect[1];
  const [a, b] = h <= 32 ? [3, 2] : h >= 45 ? [1, 1.5] : [SCALE, 3];
  const first = await readOnce(image, ocr, f, rect, a);
  const second = await readOnce(image, ocr, f, rect, b);
  const best = first.confidence >= second.confidence ? first : second;
  if (first.value !== second.value) {
    return { ...best, status: "check", confidence: Math.min(first.confidence, second.confidence) };
  }
  return best;
}

/** O aviso de "não parece um laudo": proporção da imagem e rótulos impressos da composição corporal. */
async function looksLikeReport(image: ReportImage, ocr: OcrEngine): Promise<boolean> {
  if (Math.abs(image.originalAspect / ASPECT - 1) > ASPECT_TOLERANCE) return false;
  const res = await ocr.recognize(await image.crop(COMPOSITION_LABELS_RECT, SCALE), "text");
  const t = normalizeText(res.text);
  return COMPOSITION_LABELS.filter((l) => t.includes(l)).length >= 3;
}

export const NOT_REPORT_WARNING =
  "Esta imagem não parece um laudo InBody120. Envie a foto do laudo inteiro ou preencha manualmente.";

/**
 * Lê um laudo InBody120 normalizado: devolve valor, confiança e situação de cada campo.
 * Sem inventar nada: campo ilegível ou duvidoso fica `check`; campo que o layout antigo
 * não traz (Massa livre de gordura) fica `missing`.
 */
export async function readReport(image: ReportImage, ocr: OcrEngine): Promise<ReadResult> {
  if (!(await looksLikeReport(image, ocr))) {
    return { templateVersion: REPORT_TEMPLATE.version, looksLikeReport: false, warning: NOT_REPORT_WARNING, fields: [] };
  }

  const fields: ReadField[] = [];
  const anchors: TemplateField[] = [];
  for (const f of REPORT_TEMPLATE.fields) {
    if (f.mode === "anchor") anchors.push(f);
    else fields.push(await readNumberLike(image, ocr, f, f.rect));
  }

  if (anchors.length) {
    // acha as linhas dos rótulos uma vez só e lê o valor à direita de cada uma
    const labelRect = anchors[0].labelRect as Rect;
    const labels = await ocr.recognize(await image.crop(labelRect, SCALE), "text");
    for (const f of anchors) {
      const keyword = ANCHOR_KEYWORDS[f.key];
      const line = labels.lines.find((l) => normalizeText(l.text).includes(keyword));
      if (!line) {
        fields.push({ key: f.key, value: null, confidence: 100, status: "missing", raw: "" });
        continue;
      }
      const yc = labelRect[1] + (line.bbox[1] + line.bbox[3]) / 2 / SCALE;
      const rect: Rect = [f.rect[0], Math.round(yc - 20), f.rect[2], Math.round(yc + 20)];
      fields.push(await readNumberLike(image, ocr, f, rect));
    }
  }

  return { templateVersion: REPORT_TEMPLATE.version, looksLikeReport: true, warning: null, fields };
}
