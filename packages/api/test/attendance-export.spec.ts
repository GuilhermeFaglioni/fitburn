import { ATTENDANCE_EXPORT_COLUMNS } from "@fitburn/contracts";
import {
  attendanceCsvRow,
  type AttendanceRecord,
} from "../src/exports/attendance-export.service.js";

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: "occ-1",
    name: "Treino Funcional",
    // 18:00 locais de 5 de outubro de 2026 (UTC−3)
    startsAt: new Date("2026-10-05T21:00:00.000Z"),
    status: "SCHEDULED",
    present: 0,
    absent: 0,
    pending: 0,
    ...overrides,
  };
}

describe("attendanceCsvRow: linha de presenças por ocorrência", () => {
  it("tem uma célula por coluna do contrato, na ordem do contrato", () => {
    expect(attendanceCsvRow(record())).toHaveLength(ATTENDANCE_EXPORT_COLUMNS.length);
  });

  it("aula sem reservas sai com zeros nas três contagens", () => {
    expect(attendanceCsvRow(record())).toEqual([
      "occ-1",
      "Treino Funcional",
      "2026-10-05",
      "18:00",
      "AGENDADA",
      0,
      0,
      0,
    ]);
  });

  it("cada contagem vai para a sua coluna: presentes, faltas, pendentes", () => {
    const row = attendanceCsvRow(record({ present: 4, absent: 2, pending: 3 }));

    expect(row.slice(5)).toEqual([4, 2, 3]);
  });

  it("reserva pendente nunca vira falta", () => {
    const row = attendanceCsvRow(record({ pending: 5 }));

    expect(row[6]).toBe(0);
    expect(row[7]).toBe(5);
  });

  it("ocorrência cancelada sai como CANCELADA e mantém as contagens das reservas", () => {
    const row = attendanceCsvRow(record({ status: "CANCELLED", present: 1, pending: 2 }));

    expect(row[4]).toBe("CANCELADA");
    expect(row.slice(5)).toEqual([1, 0, 2]);
  });

  it("data e hora são as locais da academia, mesmo perto da meia-noite UTC", () => {
    // 23:30 de 4 de outubro em São Paulo = 02:30 UTC de 5 de outubro
    const row = attendanceCsvRow(record({ startsAt: new Date("2026-10-05T02:30:00.000Z") }));

    expect(row[2]).toBe("2026-10-04");
    expect(row[3]).toBe("23:30");
  });
});
