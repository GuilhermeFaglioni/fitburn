import { describe, expect, it } from "vitest";
import { readResultToForm } from "./to-form";
import type { ReadField, ReadResult } from "./types";

const f = (key: string, value: number | string | null, status: ReadField["status"] = "ok"): ReadField => ({
  key,
  value,
  confidence: 80,
  status,
  raw: "",
});

const result = (fields: ReadField[]): ReadResult => ({ templateVersion: 2, looksLikeReport: true, warning: null, fields });

describe("readResultToForm", () => {
  it("separa data e hora, usa vírgula decimal e conta lidos × conferir", () => {
    const fill = readResultToForm(
      result([f("measuredAt", "2026-03-15T09:30"), f("weight", 70.5), f("bmi", 24.1, "check"), f("fatFreeMass", null, "missing")]),
    );
    expect(fill.values.date).toBe("2026-03-15");
    expect(fill.values.time).toBe("09:30");
    expect(fill.values.measures.weight!.value).toBe("70,5");
    expect(fill.values.measures.bmi!.value).toBe("24,1");
    expect(fill.checkMeasures).toEqual(new Set(["bmi"]));
    expect(fill.readCount).toBe(2);
    expect(fill.checkCount).toBe(1);
  });

  it("liga percentual e avaliação à medida do segmentar", () => {
    const fill = readResultToForm(result([f("leanLeftArm", 3.1), f("leanLeftArmPercent", 101.5, "check"), f("leanLeftArmRating", "Acima")]));
    const arm = fill.values.measures.leanLeftArm!;
    expect(arm).toMatchObject({ value: "3,1", percent: "101,5", rating: "ABOVE" });
    expect(fill.checkMeasures.has("leanLeftArm")).toBe(true);
  });

  it("idade com decimal vira anos inteiros e fica para conferir; data não lida também", () => {
    const fill = readResultToForm(result([f("age", 30.4), f("measuredAt", null, "check")]));
    expect(fill.values.age).toBe("30");
    expect(fill.checkHeader).toEqual(new Set(["age", "date", "time"]));
  });
});
