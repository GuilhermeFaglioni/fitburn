import {
  AssessmentCheckCode,
  assessmentMeasuresSchema,
  BIOIMPEDANCE_MEASURES,
  checkAssessment,
  flaggedMeasureKeys,
} from "@fitburn/contracts";

const v = (value: number) => ({ value });

const consistent = {
  weight: v(69.2),
  totalBodyWater: v(40.9),
  protein: v(11.2),
  minerals: v(3.82),
  bodyFatMass: v(13.3),
  bodyFatPercent: v(19.2),
  bmi: v(23.4),
  fatFreeMass: v(55.9),
};

describe("catálogo de medidas da bioimpedância", () => {
  it("tem chaves únicas e limites coerentes", () => {
    const keys = BIOIMPEDANCE_MEASURES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of BIOIMPEDANCE_MEASURES) expect(m.limits[0]).toBeLessThan(m.limits[1]);
  });

  it("o schema deriva do catálogo: só o peso é obrigatório e chave desconhecida é recusada", () => {
    expect(assessmentMeasuresSchema.safeParse({ weight: v(70) }).success).toBe(true);
    expect(assessmentMeasuresSchema.safeParse({}).success).toBe(false);
    expect(assessmentMeasuresSchema.safeParse({ weight: v(70), x: v(1) }).success).toBe(false);
    expect(assessmentMeasuresSchema.safeParse({ weight: v(70), leanTrunk: { value: 25, percent: 100, rating: "NORMAL" } }).success).toBe(true);
    expect(assessmentMeasuresSchema.safeParse({ weight: v(70), minerals: { value: 3, percent: 100 } }).success).toBe(false);
  });
});

describe("checagens da bioimpedância (função pura)", () => {
  it("laudo coerente não gera marcação", () => {
    expect(checkAssessment({ heightCm: 172, measures: consistent })).toEqual([]);
  });

  it("só roda a checagem cujos valores foram informados (laudo antigo sem massa livre de gordura)", () => {
    const { fatFreeMass: _omit, ...old } = consistent;
    void _omit;
    expect(checkAssessment({ heightCm: 172, measures: old })).toEqual([]);
    expect(checkAssessment({ measures: { weight: v(70) } })).toEqual([]);
  });

  it("soma da composição diferente do peso marca as cinco medidas", () => {
    const issues = checkAssessment({ heightCm: 172, measures: { ...consistent, protein: v(13.2) } });
    const sum = issues.find((i) => i.code === AssessmentCheckCode.COMPOSITION_SUM);
    expect(sum?.keys).toEqual(["totalBodyWater", "protein", "minerals", "bodyFatMass", "weight"]);
    expect(sum?.message).toContain("71,22");
  });

  it("aceita a tolerância (±0,3) e marca acima dela", () => {
    expect(checkAssessment({ measures: { ...consistent, weight: v(69.5) } }).map((i) => i.code)).not.toContain(
      AssessmentCheckCode.COMPOSITION_SUM,
    );
    expect(checkAssessment({ measures: { ...consistent, weight: v(69.6) } }).map((i) => i.code)).toContain(
      AssessmentCheckCode.COMPOSITION_SUM,
    );
  });

  it("PGC, IMC e massa livre de gordura fora da tolerância marcam o campo", () => {
    const pgc = checkAssessment({ measures: { ...consistent, bodyFatPercent: v(25) } });
    expect(pgc.find((i) => i.code === AssessmentCheckCode.BODY_FAT_PERCENT)?.keys).toContain("bodyFatPercent");
    const bmi = checkAssessment({ heightCm: 172, measures: { ...consistent, bmi: v(30) } });
    expect(bmi.find((i) => i.code === AssessmentCheckCode.BMI)?.keys).toContain("bmi");
    const ffm = checkAssessment({ measures: { ...consistent, fatFreeMass: v(50) } });
    expect(ffm.find((i) => i.code === AssessmentCheckCode.FAT_FREE_MASS)?.keys).toContain("fatFreeMass");
  });

  it("IMC não é checado sem altura", () => {
    expect(
      checkAssessment({ measures: { ...consistent, bmi: v(30) } }).some((i) => i.code === AssessmentCheckCode.BMI),
    ).toBe(false);
  });

  it("valor fora dos limites do catálogo marca a medida", () => {
    const issues = checkAssessment({ measures: { weight: v(70), visceralFatLevel: v(99) } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: AssessmentCheckCode.OUT_OF_LIMITS, keys: ["visceralFatLevel"] });
    expect([...flaggedMeasureKeys(issues)]).toEqual(["visceralFatLevel"]);
  });
});
