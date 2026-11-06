import { ErrorCode, ErrorStatus } from "@fitburn/contracts";
import { DomainError } from "../src/common/errors/domain-error.js";
import { resolveExportPeriod } from "../src/exports/export-period.js";

function errorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Esperava um DomainError, mas nada foi lançado.");
}

describe("resolveExportPeriod: limites em America/Sao_Paulo (UTC−3, sem horário de verão)", () => {
  it("um dia local vai de 00h00 até 00h00 do dia seguinte, em UTC", () => {
    const period = resolveExportPeriod("2026-10-05", "2026-10-05");

    expect(period).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
      startsAtGte: new Date("2026-10-05T03:00:00.000Z"),
      startsAtLt: new Date("2026-10-06T03:00:00.000Z"),
    });
  });

  it("o fim é exclusivo no dia seguinte, mesmo na virada de mês", () => {
    const period = resolveExportPeriod("2026-10-31", "2026-11-01");

    expect(period.startsAtGte).toEqual(new Date("2026-10-31T03:00:00.000Z"));
    expect(period.startsAtLt).toEqual(new Date("2026-11-02T03:00:00.000Z"));
  });
});

describe("resolveExportPeriod: validação do intervalo", () => {
  it("data inicial posterior à final é erro de validação explícito", () => {
    const error = errorOf(() => resolveExportPeriod("2026-10-10", "2026-10-09"));

    expect(error.getStatus()).toBe(ErrorStatus.VALIDATION);
    expect(error.getResponse()).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: "A data inicial não pode ser posterior à data final.",
      details: undefined,
    });
  });

  it("aceita exatamente 92 dias (inclusive)", () => {
    expect(() => resolveExportPeriod("2026-08-01", "2026-10-31")).not.toThrow();
  });

  it("recusa 93 dias com a mensagem do limite", () => {
    const error = errorOf(() => resolveExportPeriod("2026-08-01", "2026-11-01"));

    expect(error.getStatus()).toBe(ErrorStatus.VALIDATION);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      message: "O período máximo da exportação é de 92 dias.",
    });
  });
});
