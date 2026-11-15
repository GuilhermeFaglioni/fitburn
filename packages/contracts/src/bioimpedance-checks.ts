import { BIOIMPEDANCE_MEASURES, type MeasureValue } from "./bioimpedance-catalog.js";

/** Tolerâncias das checagens (D-041): marcam "conferir", não impedem salvar. */
export const BIOIMPEDANCE_TOLERANCES = {
  /** água + proteína + minerais + gordura ≈ peso (kg). */
  compositionSum: 0.3,
  /** PGC ≈ gordura / peso (pontos percentuais). */
  bodyFatPercent: 0.3,
  /** IMC ≈ peso / altura² (kg/m²). */
  bmi: 0.2,
  /** massa livre de gordura ≈ peso − gordura (kg). */
  fatFreeMass: 0.3,
} as const;

export const AssessmentCheckCode = {
  COMPOSITION_SUM: "COMPOSITION_SUM",
  BODY_FAT_PERCENT: "BODY_FAT_PERCENT",
  BMI: "BMI",
  FAT_FREE_MASS: "FAT_FREE_MASS",
  OUT_OF_LIMITS: "OUT_OF_LIMITS",
} as const;
export type AssessmentCheckCodeName = (typeof AssessmentCheckCode)[keyof typeof AssessmentCheckCode];

export interface AssessmentCheckIssue {
  code: AssessmentCheckCodeName;
  /** Chaves das medidas que a checagem pede para conferir. */
  keys: string[];
  message: string;
}

export interface AssessmentCheckInput {
  heightCm?: number | null;
  measures: Partial<Record<string, Pick<MeasureValue, "value"> | undefined>>;
}

const round = (n: number, digits = 2) => Number(n.toFixed(digits));

function format(n: number): string {
  return String(round(n)).replace(".", ",");
}

/**
 * Checagens de consistência de uma avaliação (função pura). Cada checagem só roda quando todos os
 * valores de que depende foram informados. Devolve os problemas encontrados; lista vazia = tudo certo.
 */
export function checkAssessment(input: AssessmentCheckInput): AssessmentCheckIssue[] {
  const v = (key: string): number | undefined => input.measures[key]?.value;
  const issues: AssessmentCheckIssue[] = [];

  const weight = v("weight");
  const water = v("totalBodyWater");
  const protein = v("protein");
  const minerals = v("minerals");
  const fat = v("bodyFatMass");

  if (weight !== undefined && water !== undefined && protein !== undefined && minerals !== undefined && fat !== undefined) {
    const sum = water + protein + minerals + fat;
    if (Math.abs(sum - weight) > BIOIMPEDANCE_TOLERANCES.compositionSum + 1e-9) {
      issues.push({
        code: AssessmentCheckCode.COMPOSITION_SUM,
        keys: ["totalBodyWater", "protein", "minerals", "bodyFatMass", "weight"],
        message: `Água + proteína + minerais + gordura somam ${format(sum)} kg, mas o peso é ${format(weight)} kg.`,
      });
    }
  }

  const percent = v("bodyFatPercent");
  if (weight !== undefined && weight > 0 && fat !== undefined && percent !== undefined) {
    const expected = (fat / weight) * 100;
    if (Math.abs(expected - percent) > BIOIMPEDANCE_TOLERANCES.bodyFatPercent + 1e-9) {
      issues.push({
        code: AssessmentCheckCode.BODY_FAT_PERCENT,
        keys: ["bodyFatPercent", "bodyFatMass", "weight"],
        message: `A massa de gordura e o peso indicam ${format(expected)}% de gordura, mas o PGC é ${format(percent)}%.`,
      });
    }
  }

  const bmi = v("bmi");
  const height = input.heightCm ?? undefined;
  if (weight !== undefined && bmi !== undefined && height !== undefined && height > 0) {
    const meters = height / 100;
    const expected = weight / (meters * meters);
    if (Math.abs(expected - bmi) > BIOIMPEDANCE_TOLERANCES.bmi + 1e-9) {
      issues.push({
        code: AssessmentCheckCode.BMI,
        keys: ["bmi", "weight"],
        message: `Peso e altura indicam IMC ${format(expected)}, mas o IMC informado é ${format(bmi)}.`,
      });
    }
  }

  const ffm = v("fatFreeMass");
  if (weight !== undefined && fat !== undefined && ffm !== undefined) {
    const expected = weight - fat;
    if (Math.abs(expected - ffm) > BIOIMPEDANCE_TOLERANCES.fatFreeMass + 1e-9) {
      issues.push({
        code: AssessmentCheckCode.FAT_FREE_MASS,
        keys: ["fatFreeMass", "bodyFatMass", "weight"],
        message: `Peso menos gordura dá ${format(expected)} kg, mas a massa livre de gordura é ${format(ffm)} kg.`,
      });
    }
  }

  for (const definition of BIOIMPEDANCE_MEASURES) {
    const value = v(definition.key);
    if (value === undefined) continue;
    const [min, max] = definition.limits;
    if (value < min || value > max) {
      issues.push({
        code: AssessmentCheckCode.OUT_OF_LIMITS,
        keys: [definition.key],
        message: `${definition.label} (${format(value)}${definition.unit ? ` ${definition.unit}` : ""}) está fora do esperado (${format(min)} a ${format(max)}).`,
      });
    }
  }

  return issues;
}

/** Chaves das medidas marcadas "conferir" por qualquer checagem. */
export function flaggedMeasureKeys(issues: readonly AssessmentCheckIssue[]): Set<string> {
  return new Set(issues.flatMap((issue) => issue.keys));
}
