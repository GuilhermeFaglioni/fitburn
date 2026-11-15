import gabaritoJson from "./template.json";

/** Retângulo [x0, y0, x1, y1] em pixels do laudo normalizado para 1420×2000. */
export type Rect = [number, number, number, number];

export type FieldMode = "position" | "band" | "anchor";
export type FieldType = "number" | "datetime" | "classification";

export interface TemplateField {
  /** Chave do catálogo (`BIOIMPEDANCE_MEASURES`) ou metadado do laudo (`measuredAt`, `height`, `age`). */
  key: string;
  /** position: área fixa; band: faixa com um único número; anchor: acha o rótulo e lê à direita. */
  mode: FieldMode;
  rect: Rect;
  type: FieldType;
  unit?: string;
  /** Folga ao redor da área no recorte (padrão 3 px); menor onde há linha pontilhada colada. */
  pad?: number;
  /** Só `anchor`: texto do rótulo e faixa onde ele é procurado. */
  label?: string;
  labelRect?: Rect;
}

export interface ReportTemplate {
  version: number;
  width: number;
  height: number;
  model: string;
  fields: TemplateField[];
  /** Áreas apagadas do original para formar a base mascarada. */
  mask: Rect[];
}

/** Gabarito de áreas do InBody120 (versionado: mudou posição, sobe `version`). */
export const REPORT_TEMPLATE = gabaritoJson as unknown as ReportTemplate;

export const REPORT_WIDTH = REPORT_TEMPLATE.width;
export const REPORT_HEIGHT = REPORT_TEMPLATE.height;
