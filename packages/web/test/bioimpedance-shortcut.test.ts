import type { BioimpedanceAssessment, MeasureValue } from "@fitburn/contracts";
import {
  BODY_SHORTCUT_METRICS,
  buildBodyShortcutSlides,
  formatShortDate,
  sparkline,
} from "../src/lib/bioimpedance/shortcut";

function make(
  id: string,
  measuredAt: string,
  measures: Record<string, MeasureValue> & { weight: MeasureValue },
): BioimpedanceAssessment {
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
    measures,
  };
}

const NOW = new Date("2026-11-01T12:00:00.000Z");
const FIRST = make("a1", "2026-07-03T10:00:00.000Z", {
  weight: { value: 69.8 },
  bodyFatPercent: { value: 20.1 },
  skeletalMuscleMass: { value: 31.2 },
  inbodyScore: { value: 75 },
});
const SECOND = make("a2", "2026-10-20T10:00:00.000Z", {
  weight: { value: 69.2 },
  bodyFatPercent: { value: 19.2 },
  skeletalMuscleMass: { value: 31.5 },
  inbodyScore: { value: 77 },
});

describe("atalho Corpo: dados dos slides", () => {
  it("monta PGC, peso, massa muscular e pontuação, nessa ordem, com o valor da avaliação mais recente", () => {
    const slides = buildBodyShortcutSlides([SECOND, FIRST], NOW);
    expect(slides.map((slide) => slide.key)).toEqual([
      "bodyFatPercent",
      "weight",
      "skeletalMuscleMass",
      "inbodyScore",
    ]);
    expect(slides.map((slide) => `${slide.value}${slide.unit}`)).toEqual(["19,2%", "69,2kg", "31,5kg", "77/100"]);
    expect(BODY_SHORTCUT_METRICS).toHaveLength(4);
  });

  it("a variação sai da avaliação anterior, com a data dela e o sentido bom de cada medida", () => {
    const [fat, weight, muscle, score] = buildBodyShortcutSlides([FIRST, SECOND], NOW);
    expect(fat!.delta).toEqual({ trend: "down", amount: "0,9 pp", since: "03/07", good: true });
    expect(weight!.delta).toEqual({ trend: "down", amount: "0,6 kg", since: "03/07", good: false });
    expect(muscle!.delta).toEqual({ trend: "up", amount: "0,3 kg", since: "03/07", good: true });
    expect(score!.delta).toEqual({ trend: "up", amount: "2", since: "03/07", good: true });
  });

  it("cada toque abre a evolução na medida do slide", () => {
    const slides = buildBodyShortcutSlides([FIRST, SECOND], NOW);
    expect(slides.map((slide) => slide.to)).toEqual([
      "/bioimpedancia?aba=evolucao&medida=bodyFatPercent",
      "/bioimpedancia?aba=evolucao&medida=weight",
      "/bioimpedancia?aba=evolucao&medida=skeletalMuscleMass",
      "/bioimpedancia?aba=evolucao&medida=inbodyScore",
    ]);
  });

  it("com uma só avaliação não há variação nem minilinha", () => {
    const [fat] = buildBodyShortcutSlides([FIRST], NOW);
    expect(fat!.delta).toBeNull();
    expect(fat!.spark).toBeNull();
  });

  it("medida que nenhuma avaliação trouxe fica de fora", () => {
    const slides = buildBodyShortcutSlides([make("p", "2026-10-01T10:00:00.000Z", { weight: { value: 70 } })], NOW);
    expect(slides.map((slide) => slide.key)).toEqual(["weight"]);
  });

  it("a variação compara com a avaliação anterior que tem a medida", () => {
    const partial = make("p", "2026-09-01T10:00:00.000Z", { weight: { value: 70 } });
    const [fat] = buildBodyShortcutSlides([FIRST, partial, SECOND], NOW);
    expect(fat!.delta?.since).toBe("03/07");
  });

  it("formata a data curta no fuso da academia", () => {
    expect(formatShortDate("2026-07-03T10:00:00.000Z")).toBe("03/07");
    // 01h UTC ainda é o dia anterior no horário da academia.
    expect(formatShortDate("2026-07-04T01:00:00.000Z")).toBe("03/07");
  });
});

describe("minilinha", () => {
  it("precisa de ao menos dois valores", () => {
    expect(sparkline([])).toBeNull();
    expect(sparkline([70])).toBeNull();
  });

  it("o menor valor fica embaixo, o maior em cima, e o último ponto é o mais recente", () => {
    const spark = sparkline([10, 20, 15])!;
    expect(spark.points).toBe("4.0,26.0 50.0,4.0 96.0,15.0");
    expect(spark.last).toEqual({ x: 96, y: 15 });
  });

  it("valores iguais viram uma reta no meio", () => {
    expect(sparkline([5, 5, 5])!.points).toBe("4.0,15.0 50.0,15.0 96.0,15.0");
  });

  it("limita às 6 avaliações mais recentes", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      make(`m${index}`, `2026-0${index + 1}-10T10:00:00.000Z`, { weight: { value: 70 + index } }),
    );
    const [weight] = buildBodyShortcutSlides(many, NOW);
    expect(weight!.spark!.points.split(" ")).toHaveLength(6);
  });
});
