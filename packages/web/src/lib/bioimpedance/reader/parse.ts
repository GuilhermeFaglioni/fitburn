/** Tira acentos e põe em minúsculas, para comparar texto do OCR (modelo sem acentos). */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** "- 4,9" → -4.9; "1.710" não é milhar (o laudo usa vírgula decimal); lixo → null. */
export function parseNumber(raw: string): number | null {
  const compact = raw
    .replace(/\s+/g, "")
    .replace(/(kg|kcal|cm|%|ω|Ω)+$/i, "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1");
  const m = /^([+-])?(\d+)(?:[.,](\d+))?$/.exec(compact);
  if (!m) return null;
  const n = Number(`${m[2]}.${m[3] ?? "0"}`);
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" ? -n : n;
}

/** "15.03.2027. 09:30" → "2027-03-15T09:30" (hora local, sem fuso); inválido → null. */
export function parseDateTime(raw: string): string | null {
  const m = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\.?\s*(\d{1,2})[:.](\d{2})/.exec(raw.replace(/[Oo]/g, "0"));
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  const day = Number(d), month = Number(mo), hour = Number(h), min = Number(mi);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(month)}-${p(day)}T${p(hour)}:${p(min)}`;
}

export type Rating = "Abaixo" | "Normal" | "Acima";

/** Classificação do laudo, tolerante a erro de OCR. */
export function parseRating(raw: string): Rating | null {
  const t = normalizeText(raw);
  if (/^(n[o0]rmal|norma|n0rma)/.test(t) || t.includes("normal")) return "Normal";
  if (t.includes("acima") || t.includes("acim")) return "Acima";
  if (t.includes("abaixo") || t.includes("abaix")) return "Abaixo";
  return null;
}
