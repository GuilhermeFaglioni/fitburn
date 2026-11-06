import { occupancyCsvRow, type OccupancyRecord } from "../src/exports/occupancy-export.service.js";

function record(overrides: Partial<OccupancyRecord> = {}): OccupancyRecord {
  return {
    id: "occ-1",
    name: "Treino Funcional",
    // 18:00 locais de 5 de outubro de 2026 (UTC−3)
    startsAt: new Date("2026-10-05T21:00:00.000Z"),
    capacity: 12,
    status: "SCHEDULED",
    occupiedCount: 0,
    ...overrides,
  };
}

describe("occupancyCsvRow: cálculo da linha de ocupação", () => {
  it("aula sem reservas: 0 ocupadas, tudo disponível, 0%", () => {
    expect(occupancyCsvRow(record())).toEqual([
      "occ-1",
      "Treino Funcional",
      "2026-10-05",
      "18:00",
      "AGENDADA",
      12,
      0,
      12,
      0,
    ]);
  });

  it("percentual com uma casa decimal (5 de 12 = 41,666… → 41,7)", () => {
    const row = occupancyCsvRow(record({ occupiedCount: 5 }));

    expect(row[6]).toBe(5);
    expect(row[7]).toBe(7);
    expect(row[8]).toBe(41.7);
  });

  it("87,5% quando 7 de 8 vagas estão ocupadas", () => {
    const row = occupancyCsvRow(record({ capacity: 8, occupiedCount: 7 }));

    expect(row[8]).toBe(87.5);
  });

  it("não limita a 100%: mais ocupadas que a capacidade (capacidade reduzida depois)", () => {
    const row = occupancyCsvRow(record({ capacity: 10, occupiedCount: 12 }));

    expect(row[7]).toBe(0);
    expect(row[8]).toBe(120);
  });

  it("capacidade zero: percentual vazio, sem divisão por zero", () => {
    expect(occupancyCsvRow(record({ capacity: 0 }))[8]).toBeNull();
    expect(occupancyCsvRow(record({ capacity: 0, occupiedCount: 3 }))).toEqual([
      "occ-1",
      "Treino Funcional",
      "2026-10-05",
      "18:00",
      "AGENDADA",
      0,
      3,
      0,
      null,
    ]);
  });

  it("ocorrência cancelada sai como CANCELADA", () => {
    expect(occupancyCsvRow(record({ status: "CANCELLED" }))[4]).toBe("CANCELADA");
  });

  it("data e hora são as locais da academia, mesmo perto da meia-noite UTC", () => {
    // 23:30 de 4 de outubro em São Paulo = 02:30 UTC de 5 de outubro
    const row = occupancyCsvRow(record({ startsAt: new Date("2026-10-05T02:30:00.000Z") }));

    expect(row[2]).toBe("2026-10-04");
    expect(row[3]).toBe("23:30");
  });
});
