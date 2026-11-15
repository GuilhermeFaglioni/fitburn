import { describe, expect, it } from "vitest";
import { applyCrossChecks } from "./cross-check";
import type { ReadField } from "./types";

const ok = (key: string, value: number): ReadField => ({ key, value, confidence: 90, status: "ok", raw: String(value) });
const base = () => [ok("height", 180), ok("weight", 80), ok("bodyFatMass", 16)];
const status = (fields: ReadField[], key: string) => fields.find((f) => f.key === key)?.status;

describe("conferências entre campos do laudo (valores fictícios)", () => {
  it("mantém ok o que bate com os campos de apoio", () => {
    // MLG 64 → TMB 370 + 21,6 × 64 = 1752,4; IMC 24,7; PGC 20
    const r = applyCrossChecks([...base(), ok("basalMetabolicRate", 1752), ok("fatFreeMass", 64), ok("bmi", 24.7), ok("bodyFatPercent", 20)]);
    for (const k of ["basalMetabolicRate", "fatFreeMass", "bmi", "bodyFatPercent"]) expect(status(r, k), k).toBe("ok");
  });

  it("rebaixa para conferir o dígito errado com confiança alta (ex.: 1 lido como 4 na TMB)", () => {
    const r = applyCrossChecks([...base(), ok("basalMetabolicRate", 4752)]);
    expect(status(r, "basalMetabolicRate")).toBe("check");
    expect(r.find((f) => f.key === "basalMetabolicRate")?.value).toBe(4752); // não corrige, só rebaixa
  });

  it("rebaixa MLG, IMC e PGC que não batem com peso, altura e massa de gordura", () => {
    const r = applyCrossChecks([...base(), ok("fatFreeMass", 54), ok("bmi", 29.7), ok("bodyFatPercent", 25)]);
    for (const k of ["fatFreeMass", "bmi", "bodyFatPercent"]) expect(status(r, k), k).toBe("check");
  });

  it("sem os campos de apoio confiáveis não há como conferir: conferir", () => {
    const duvidoso: ReadField = { ...ok("weight", 80), status: "check" };
    const r = applyCrossChecks([ok("height", 180), duvidoso, ok("bodyFatMass", 16), ok("basalMetabolicRate", 1752)]);
    expect(status(r, "basalMetabolicRate")).toBe("check");
  });

  it("não mexe em campos sem regra nem em campos que já não eram ok", () => {
    const check: ReadField = { ...ok("bmi", 99), status: "check" };
    const r = applyCrossChecks([...base(), ok("targetWeight", 70), check]);
    expect(status(r, "targetWeight")).toBe("ok");
    expect(status(r, "bmi")).toBe("check");
  });
});
