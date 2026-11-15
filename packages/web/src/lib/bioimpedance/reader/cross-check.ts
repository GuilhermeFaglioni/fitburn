import type { ReadField } from "./types";

/**
 * Conferências entre campos do próprio laudo. O OCR pode errar com confiança alta (ex.: o "1" de
 * "1570 kcal" lido como "4"); como o InBody calcula vários campos a partir de outros, um valor
 * que não bate com os campos de que depende deixa de ser confiável e vira "conferir".
 * Nunca corrige um valor nem preenche um campo: só rebaixa de `ok` para `check`.
 */

/** Taxa metabólica basal do InBody: 370 + 21,6 × massa livre de gordura (peso − massa de gordura). */
const bmrDe = (peso: number, gordura: number) => 370 + 21.6 * (peso - gordura);

const BMR_TOLERANCIA = 0.015;
const BMI_TOLERANCIA = 0.5;
const PGC_TOLERANCIA = 0.5;
const MLG_TOLERANCIA = 0.15;

export function applyCrossChecks(fields: ReadField[]): ReadField[] {
  const porChave = new Map(fields.map((f) => [f.key, f]));
  /** Valor de um campo só se ele próprio foi lido com confiança. */
  const valor = (k: string): number | null => {
    const f = porChave.get(k);
    return f && f.status === "ok" && typeof f.value === "number" ? f.value : null;
  };

  const peso = valor("weight");
  const gordura = valor("bodyFatMass");
  const altura = valor("height");

  // `bate` devolve null quando faltam os campos de apoio: sem como conferir, não há confiança.
  const regras: Record<string, (v: number) => boolean | null> = {
    bmi: (v) => (peso && altura ? Math.abs(v - peso / (altura / 100) ** 2) <= BMI_TOLERANCIA : null),
    bodyFatPercent: (v) => (peso && gordura !== null ? Math.abs(v - (gordura / peso) * 100) <= PGC_TOLERANCIA : null),
    fatFreeMass: (v) => (peso && gordura !== null ? Math.abs(v - (peso - gordura)) <= MLG_TOLERANCIA : null),
    basalMetabolicRate: (v) => {
      if (!peso || gordura === null) return null;
      const esperado = bmrDe(peso, gordura);
      return Math.abs(v - esperado) / esperado <= BMR_TOLERANCIA;
    },
  };

  return fields.map((f) => {
    const regra = regras[f.key];
    if (!regra || f.status !== "ok" || typeof f.value !== "number") return f;
    return regra(f.value) === true ? f : { ...f, status: "check" as const };
  });
}
