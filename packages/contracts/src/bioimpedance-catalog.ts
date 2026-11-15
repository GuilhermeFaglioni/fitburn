import { z } from "zod";

/** Versão do schema das medidas guardadas em `jsonb`. Muda quando o catálogo muda de forma incompatível. */
export const BIOIMPEDANCE_SCHEMA_VERSION = 1;

/** Grupos do laudo InBody120, na ordem em que aparecem (telas e formulário usam esta ordem). */
export const BioimpedanceGroup = {
  BODY_COMPOSITION: "BODY_COMPOSITION",
  MUSCLE_FAT: "MUSCLE_FAT",
  OBESITY: "OBESITY",
  SEGMENTAL_LEAN: "SEGMENTAL_LEAN",
  SEGMENTAL_FAT: "SEGMENTAL_FAT",
  WEIGHT_CONTROL: "WEIGHT_CONTROL",
  ADDITIONAL: "ADDITIONAL",
  IMPEDANCE: "IMPEDANCE",
  SCORE: "SCORE",
} as const;
export type BioimpedanceGroupName = (typeof BioimpedanceGroup)[keyof typeof BioimpedanceGroup];

export const BIOIMPEDANCE_GROUP_LABELS: Record<BioimpedanceGroupName, string> = {
  BODY_COMPOSITION: "Composição corporal",
  MUSCLE_FAT: "Músculo e gordura",
  OBESITY: "Obesidade (IMC e PGC)",
  SEGMENTAL_LEAN: "Massa magra segmentar",
  SEGMENTAL_FAT: "Gordura segmentar",
  WEIGHT_CONTROL: "Controle de peso",
  ADDITIONAL: "Dados adicionais",
  IMPEDANCE: "Impedância (20 e 100 kHz)",
  SCORE: "Pontuação InBody",
};

export const BIOIMPEDANCE_GROUP_ORDER = Object.keys(BIOIMPEDANCE_GROUP_LABELS) as BioimpedanceGroupName[];

/** Definição de uma medida do laudo. */
export interface MeasureDefinition {
  key: string;
  /** Rótulo em português, como no laudo. */
  label: string;
  /** Unidade de exibição ("" quando não há, como na pontuação e na relação cintura-quadril). */
  unit: string;
  group: BioimpedanceGroupName;
  /** Limites plausíveis do valor: fora deles o schema recusa e as checagens marcam. */
  limits: readonly [min: number, max: number];
  /** O laudo traz faixa de referência (mínimo e máximo normais) para esta medida. */
  hasRange: boolean;
  /** O laudo classifica a medida em Abaixo, Normal ou Acima. */
  hasClassification: boolean;
  /** No segmentar, o laudo traz também o % em relação ao ideal. */
  hasPercent: boolean;
}

function def(
  key: string,
  label: string,
  unit: string,
  group: BioimpedanceGroupName,
  limits: readonly [number, number],
  options: { range?: boolean; classification?: boolean; percent?: boolean } = {},
): MeasureDefinition {
  return {
    key,
    label,
    unit,
    group,
    limits,
    hasRange: options.range ?? false,
    hasClassification: options.classification ?? false,
    hasPercent: options.percent ?? false,
  };
}

const G = BioimpedanceGroup;
const RANGED = { range: true, classification: true };

const SEGMENTS = [
  ["LeftArm", "Braço esquerdo"],
  ["RightArm", "Braço direito"],
  ["Trunk", "Tronco"],
  ["LeftLeg", "Perna esquerda"],
  ["RightLeg", "Perna direita"],
] as const;

const segmental = (prefix: "lean" | "fat", group: BioimpedanceGroupName, max: number) =>
  SEGMENTS.map(([suffix, label]) =>
    def(`${prefix}${suffix}`, label, "kg", group, [0, max], {
      classification: true,
      percent: true,
    }),
  );

const impedance = SEGMENTS.flatMap(([suffix, label]) => [
  def(`impedance20${suffix}`, `${label} · 20 kHz`, "Ω", G.IMPEDANCE, [0, 2000]),
  def(`impedance100${suffix}`, `${label} · 100 kHz`, "Ω", G.IMPEDANCE, [0, 2000]),
]);

/** Catálogo fixo das medidas do InBody120. Telas, gráficos, formulário e leitor usam esta lista. */
export const BIOIMPEDANCE_MEASURES: readonly MeasureDefinition[] = [
  def("totalBodyWater", "Água corporal total", "L", G.BODY_COMPOSITION, [10, 100], RANGED),
  def("protein", "Proteína", "kg", G.BODY_COMPOSITION, [2, 40], RANGED),
  def("minerals", "Minerais", "kg", G.BODY_COMPOSITION, [0.5, 15], RANGED),
  def("bodyFatMass", "Massa de gordura", "kg", G.BODY_COMPOSITION, [1, 150], RANGED),
  def("weight", "Peso", "kg", G.BODY_COMPOSITION, [20, 300], RANGED),

  def("skeletalMuscleMass", "Massa muscular esquelética", "kg", G.MUSCLE_FAT, [5, 80], RANGED),

  def("bmi", "IMC", "kg/m²", G.OBESITY, [8, 70], RANGED),
  def("bodyFatPercent", "Gordura corporal (PGC)", "%", G.OBESITY, [2, 70], RANGED),

  ...segmental("lean", G.SEGMENTAL_LEAN, 40),
  ...segmental("fat", G.SEGMENTAL_FAT, 40),

  def("targetWeight", "Peso ideal", "kg", G.WEIGHT_CONTROL, [20, 300]),
  def("weightControl", "Controle de peso", "kg", G.WEIGHT_CONTROL, [-150, 150]),
  def("fatControl", "Controle de gordura", "kg", G.WEIGHT_CONTROL, [-150, 150]),
  def("muscleControl", "Controle de músculo", "kg", G.WEIGHT_CONTROL, [-80, 80]),

  def("fatFreeMass", "Massa livre de gordura", "kg", G.ADDITIONAL, [10, 150], RANGED),
  def("basalMetabolicRate", "Taxa metabólica basal", "kcal", G.ADDITIONAL, [500, 4000], RANGED),
  def("waistHipRatio", "Relação cintura-quadril", "", G.ADDITIONAL, [0.4, 1.6], RANGED),
  def("visceralFatLevel", "Nível de gordura visceral", "", G.ADDITIONAL, [1, 30], RANGED),
  def("obesityDegree", "Grau de obesidade", "%", G.ADDITIONAL, [50, 300], RANGED),

  ...impedance,

  def("inbodyScore", "Pontuação InBody", "pontos", G.SCORE, [0, 100]),
];

export type MeasureKey = string;

export const BIOIMPEDANCE_MEASURE_KEYS = BIOIMPEDANCE_MEASURES.map((m) => m.key);

const BY_KEY = new Map(BIOIMPEDANCE_MEASURES.map((m) => [m.key, m]));

export function measureDefinition(key: string): MeasureDefinition | undefined {
  return BY_KEY.get(key);
}

/** Medidas de um grupo, na ordem do catálogo. */
export function measuresOfGroup(group: BioimpedanceGroupName): MeasureDefinition[] {
  return BIOIMPEDANCE_MEASURES.filter((m) => m.group === group);
}

/** Toda medida é opcional, exceto o peso. */
export const REQUIRED_MEASURE_KEYS: readonly string[] = ["weight"];

export const MeasureRating = {
  BELOW: "BELOW",
  NORMAL: "NORMAL",
  ABOVE: "ABOVE",
} as const;
export type MeasureRatingName = (typeof MeasureRating)[keyof typeof MeasureRating];
export const MEASURE_RATING_LABELS: Record<MeasureRatingName, string> = {
  BELOW: "Abaixo",
  NORMAL: "Normal",
  ABOVE: "Acima",
};

const finite = z.number().finite();

function measureValueSchema(definition: MeasureDefinition) {
  const [min, max] = definition.limits;
  const label = definition.label;
  const unit = definition.unit ? ` ${definition.unit}` : "";
  const bounded = (field: string) =>
    finite
      .min(min, `${field} fora do limite plausível (mínimo ${min}${unit}).`)
      .max(max, `${field} fora do limite plausível (máximo ${max}${unit}).`);
  return z
    .object({
      value: bounded(label),
      percent: definition.hasPercent
        ? finite.min(0, `${label}: o % não pode ser negativo.`).max(500, `${label}: % acima do plausível.`).optional()
        : z.undefined().optional(),
      rangeMin: definition.hasRange ? bounded(`${label} (mínimo da faixa)`).optional() : z.undefined().optional(),
      rangeMax: definition.hasRange ? bounded(`${label} (máximo da faixa)`).optional() : z.undefined().optional(),
      rating:
        definition.hasClassification || definition.hasRange
          ? z.enum([MeasureRating.BELOW, MeasureRating.NORMAL, MeasureRating.ABOVE]).optional()
          : z.undefined().optional(),
    })
    .strict();
}

export type MeasureValue = {
  value: number;
  percent?: number;
  rangeMin?: number;
  rangeMax?: number;
  rating?: MeasureRatingName;
};

/**
 * Schema das medidas de uma avaliação, derivado do catálogo: chaves desconhecidas são recusadas,
 * cada valor respeita os limites da medida e só o peso é obrigatório.
 */
export const assessmentMeasuresSchema = z
  .object(
    Object.fromEntries(
      BIOIMPEDANCE_MEASURES.map((definition) => {
        const schema = measureValueSchema(definition);
        return [
          definition.key,
          REQUIRED_MEASURE_KEYS.includes(definition.key)
            ? schema
            : schema.optional(),
        ];
      }),
    ) as Record<string, z.ZodTypeAny>,
  )
  .strict();

export type AssessmentMeasures = { weight: MeasureValue } & Partial<
  Record<string, MeasureValue>
>;
