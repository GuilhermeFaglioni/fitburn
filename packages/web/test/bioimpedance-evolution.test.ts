import type { BioimpedanceAssessment } from "@fitburn/contracts";
import { labeledIndexes } from "../src/components/LineChart";
import {
  evolutionPoints,
  measureFullLabel,
  periodStart,
  resolveMeasure,
  resolvePeriod,
  resolveSegmentKind,
} from "../src/lib/bioimpedance/evolution";
import { variationBetween } from "../src/lib/bioimpedance/summary";

function item(id: string, measuredAt: string, weight?: number): BioimpedanceAssessment {
  return {
    id,
    clientId: "c",
    clientName: "Cliente Exemplo",
    measuredAt,
    heightCm: 170,
    age: 30,
    source: "MANUAL",
    authorName: "Prof. Exemplo",
    schemaVersion: 1,
    createdAt: measuredAt,
    updatedAt: measuredAt,
    measures: {
      weight: { value: 70 },
      ...(weight === undefined ? {} : { bodyFatMass: { value: weight } }),
    },
  };
}

const NOW = new Date("2026-11-15T12:00:00.000Z");

describe("evolução: funções puras (#198)", () => {
  it("periodStart recua 6 meses ou 1 ano, e 'tudo' não corta", () => {
    expect(periodStart("6m", NOW)?.toISOString()).toBe("2026-05-15T12:00:00.000Z");
    expect(periodStart("1y", NOW)?.toISOString()).toBe("2025-11-15T12:00:00.000Z");
    expect(periodStart("all", NOW)).toBeNull();
  });

  it("evolutionPoints ordena do mais antigo, filtra o período e ignora quem não tem a medida", () => {
    const items = [
      item("b", "2026-07-03T00:00:00.000Z", 14),
      item("a", "2025-03-10T00:00:00.000Z", 15),
      item("c", "2026-11-11T00:00:00.000Z"),
      item("d", "2026-09-01T00:00:00.000Z", 13),
    ];
    expect(evolutionPoints(items, "bodyFatMass", "all", NOW).map((p) => p.id)).toEqual(["a", "b", "d"]);
    expect(evolutionPoints(items, "bodyFatMass", "6m", NOW).map((p) => p.id)).toEqual(["b", "d"]);
    expect(evolutionPoints(items, "bodyFatMass", "1y", NOW).map((p) => p.value)).toEqual([14, 13]);
    expect(evolutionPoints(items, "weight", "all", NOW)).toHaveLength(4);
  });

  it("resolve medida, período e tipo com padrão seguro", () => {
    expect(resolveMeasure("bmi").key).toBe("bmi");
    expect(resolveMeasure("xyz").key).toBe("weight");
    expect(resolveMeasure(null).key).toBe("weight");
    expect(resolvePeriod("6m")).toBe("6m");
    expect(resolvePeriod("lixo")).toBe("all");
    expect(resolveSegmentKind("gordura")).toBe("fat");
    expect(resolveSegmentKind(null)).toBe("lean");
  });

  it("measureFullLabel desambigua o segmentar", () => {
    expect(measureFullLabel(resolveMeasure("leanTrunk"))).toBe("Massa magra segmentar · Tronco");
    expect(measureFullLabel(resolveMeasure("fatTrunk"))).toBe("Gordura segmentar · Tronco");
    expect(measureFullLabel(resolveMeasure("weight"))).toBe("Peso");
  });

  it("variationBetween arredonda e devolve null sem um dos valores", () => {
    expect(variationBetween("weight", 69.2, 72.8)).toEqual({ trend: "down", amount: 3.6 });
    expect(variationBetween("weight", 70, 70)).toEqual({ trend: "same", amount: 0 });
    expect(variationBetween("weight", undefined, 70)).toBeNull();
  });

  it("labeledIndexes rotula todos até 6 pontos e, acima, só as pontas e os extremos", () => {
    expect([...labeledIndexes([1, 2, 3])]).toEqual([0, 1, 2]);
    const many = [5, 9, 3, 6, 7, 8, 4, 5];
    expect([...labeledIndexes(many)].sort((a, b) => a - b)).toEqual([0, 1, 2, 7]);
  });
});
