import type { Rect } from "./template";

/** Resultado de reconhecimento de uma área. */
export interface OcrWord {
  text: string;
  confidence: number;
}

export interface OcrLine {
  words: OcrWord[];
  text: string;
  /** 0–100 */
  confidence: number;
  /** [x0, y0, x1, y1] na imagem recortada. */
  bbox: Rect;
}

export interface OcrResult {
  text: string;
  /** Menor confiança entre as palavras (0–100); 0 se nada foi lido. */
  confidence: number;
  lines: OcrLine[];
}

export type OcrKind = "number" | "text";

/** Motor de OCR (tesseract.js no navegador; o mesmo em Node nos testes). */
export interface OcrEngine {
  recognize(image: unknown, kind: OcrKind): Promise<OcrResult>;
  terminate(): Promise<void>;
}

/** Imagem do laudo já normalizada para 1420×2000; devolve recortes prontos para o OCR. */
export interface ReportImage {
  crop(rect: Rect, scale?: number): Promise<unknown>;
  /** Proporção original (largura/altura), para avisar quando não parece um laudo. */
  originalAspect: number;
}

export type FieldStatus = "ok" | "check" | "missing";

export interface ReadField {
  key: string;
  value: number | string | null;
  /** 0–100 */
  confidence: number;
  /** ok = confiante; check = o usuário deve conferir; missing = não existe neste layout. */
  status: FieldStatus;
  /** Texto cru reconhecido (só para depuração; não é persistido). */
  raw: string;
}

export interface ReadResult {
  templateVersion: number;
  looksLikeReport: boolean;
  /** Mensagem para o usuário quando `looksLikeReport` é falso. */
  warning: string | null;
  fields: ReadField[];
}
