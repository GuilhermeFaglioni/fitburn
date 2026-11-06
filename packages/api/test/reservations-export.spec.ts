import { RESERVATIONS_EXPORT_COLUMNS } from "@fitburn/contracts";
import {
  reservationsCsvRow,
  type ReservationsRecord,
} from "../src/exports/reservations-export.service.js";

function record(overrides: Partial<ReservationsRecord> = {}): ReservationsRecord {
  return {
    id: "occ-1",
    name: "Treino Funcional",
    // 18:00 locais de 5 de outubro de 2026 (UTC−3)
    startsAt: new Date("2026-10-05T21:00:00.000Z"),
    status: "SCHEDULED",
    confirmed: 0,
    cancelled: 0,
    completed: 0,
    noShow: 0,
    ...overrides,
  };
}

describe("reservationsCsvRow: linha de reservas por ocorrência", () => {
  it("tem uma célula por coluna do contrato, na ordem do contrato", () => {
    expect(reservationsCsvRow(record())).toHaveLength(RESERVATIONS_EXPORT_COLUMNS.length);
  });

  it("aula sem reservas sai com zeros em todas as contagens", () => {
    expect(reservationsCsvRow(record())).toEqual([
      "occ-1",
      "Treino Funcional",
      "2026-10-05",
      "18:00",
      "AGENDADA",
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it("cada estado vai para a sua coluna", () => {
    const row = reservationsCsvRow(
      record({ confirmed: 2, cancelled: 3, completed: 4, noShow: 5 }),
    );

    expect(row.slice(5, 9)).toEqual([2, 3, 4, 5]);
  });

  it("vagas_ocupadas soma confirmadas, concluídas e não compareceu", () => {
    const row = reservationsCsvRow(
      record({ confirmed: 2, cancelled: 3, completed: 4, noShow: 5 }),
    );

    // 2 + 4 + 5; as 3 canceladas não ocupam vaga.
    expect(row[9]).toBe(11);
  });

  it("reservas canceladas não entram em vagas_ocupadas", () => {
    const row = reservationsCsvRow(record({ cancelled: 5 }));

    expect(row[6]).toBe(5);
    expect(row[9]).toBe(0);
  });

  it("ocorrência cancelada sai como CANCELADA e mantém as contagens das reservas", () => {
    const row = reservationsCsvRow(
      record({ status: "CANCELLED", confirmed: 1, cancelled: 2 }),
    );

    expect(row[4]).toBe("CANCELADA");
    expect(row.slice(5, 10)).toEqual([1, 2, 0, 0, 1]);
  });

  it("data e hora são as locais da academia, mesmo perto da meia-noite UTC", () => {
    // 23:30 de 4 de outubro em São Paulo = 02:30 UTC de 5 de outubro
    const row = reservationsCsvRow(record({ startsAt: new Date("2026-10-05T02:30:00.000Z") }));

    expect(row[2]).toBe("2026-10-04");
    expect(row[3]).toBe("23:30");
  });
});
