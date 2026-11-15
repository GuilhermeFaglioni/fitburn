import type { BioimpedanceAssessment, MeasureValue } from "@fitburn/contracts";
import {
  formatRange,
  markerPosition,
  previousOf,
  ratingOf,
  sortAssessments,
  valueGroups,
  variation,
} from "../src/lib/bioimpedance/summary";

function make(id: string, measuredAt: string, measures: Record<string, MeasureValue>): BioimpedanceAssessment {
  return {
    id,
    clientId: "c",
    clientName: "Cliente Exemplo",
    measuredAt,
    heightCm: null,
    age: null,
    source: "MANUAL",
    authorName: "Prof. Exemplo",
    schemaVersion: 1,
    createdAt: measuredAt,
    updatedAt: measuredAt,
    measures: { weight: { value: 70 }, ...measures },
  };
}

describe("resumo da bioimpedância", () => {
  const older = make("1", "2026-01-01T10:00:00.000Z", { weight: { value: 70 } });
  const newer = make("2", "2026-02-01T10:00:00.000Z", { weight: { value: 69.4 } });

  it("ordena da mais recente e acha a anterior", () => {
    const sorted = sortAssessments([older, newer]);
    expect(sorted.map((item) => item.id)).toEqual(["2", "1"]);
    expect(previousOf(sorted, newer)?.id).toBe("1");
    expect(previousOf(sorted, older)).toBeUndefined();
  });

  it("calcula a variação arredondada, sem ruído de ponto flutuante", () => {
    expect(variation("weight", newer, older)).toEqual({ trend: "down", amount: 0.6 });
    expect(variation("weight", older, newer)).toEqual({ trend: "up", amount: 0.6 });
    expect(variation("weight", newer, newer)).toEqual({ trend: "same", amount: 0 });
  });

  it("variação é nula sem avaliação anterior ou sem o valor", () => {
    expect(variation("weight", newer, undefined)).toBeNull();
    expect(variation("bmi", newer, older)).toBeNull();
  });

  it("classifica pela faixa quando o laudo não trouxe a classificação", () => {
    expect(ratingOf({ value: 30, rangeMin: 40, rangeMax: 50 })).toBe("BELOW");
    expect(ratingOf({ value: 45, rangeMin: 40, rangeMax: 50 })).toBe("NORMAL");
    expect(ratingOf({ value: 60, rangeMin: 40, rangeMax: 50 })).toBe("ABOVE");
    expect(ratingOf({ value: 60 })).toBeNull();
    expect(ratingOf({ value: 60, rating: "ABOVE" })).toBe("ABOVE");
  });

  it("o marcador fica no terço certo e nunca sai da barra", () => {
    const position = (value: number) => markerPosition({ value, rangeMin: 40, rangeMax: 50 }) as number;
    expect(position(45)).toBeCloseTo(50);
    expect(position(0)).toBe(4);
    expect(position(500)).toBe(96);
    expect(position(39)).toBeLessThan(100 / 3);
    expect(markerPosition({ value: 1 })).toBeNull();
    expect(markerPosition({ value: 1, rating: "BELOW" })).toBe(16);
  });

  it("formata a faixa no padrão brasileiro", () => {
    expect(formatRange({ value: 1, rangeMin: 37, rangeMax: 45.2 })).toBe("37–45,2");
    expect(formatRange({ value: 1 })).toBeNull();
  });

  it("agrupa os valores na ordem do laudo, sem grupos vazios nem a pontuação", () => {
    const groups = valueGroups(
      make("3", "2026-03-01T10:00:00.000Z", { bmi: { value: 22 }, inbodyScore: { value: 80 } }),
    );
    expect(groups.map((entry) => entry.group)).toEqual(["BODY_COMPOSITION", "OBESITY"]);
  });
});
