// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error script em .mjs, sem tipos
import { gerarLaudo, gerarNaoLaudo } from "../../../../scripts/laudo/gerar-sinteticos.mjs";
import { parseDateTime, parseNumber, parseRating } from "./parse";

describe("parse do laudo", () => {
  it("números com vírgula, sinal e unidade", () => {
    expect(parseNumber("82,4")).toBe(82.4);
    expect(parseNumber("- 4,9")).toBe(-4.9);
    expect(parseNumber("1710 kcal")).toBe(1710);
    expect(parseNumber("3,45kg")).toBe(3.45);
    expect(parseNumber("abc")).toBeNull();
  });
  it("data e hora do laudo", () => {
    expect(parseDateTime("15.03.2027. 09:30")).toBe("2027-03-15T09:30");
    expect(parseDateTime("32.13.2027. 09:30")).toBeNull();
    expect(parseDateTime("lixo")).toBeNull();
  });
  it("classificação tolerante", () => {
    expect(parseRating("Norma1")).toBe("Normal");
    expect(parseRating("xyz")).toBeNull();
    expect(parseRating("Normal")).toBe("Normal");
    expect(parseRating("Acima")).toBe("Acima");
    expect(parseRating("Abaixo")).toBe("Abaixo");
  });
});

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("gerador de laudos sintéticos", () => {
  it("é determinístico: mesma entrada, mesmos bytes", async () => {
    expect(hash(await gerarLaudo({ layout: "novo" }))).toBe(hash(await gerarLaudo({ layout: "novo" })));
    expect(hash(await gerarLaudo({ layout: "antigo" }))).toBe(hash(await gerarLaudo({ layout: "antigo" })));
    expect(hash(await gerarNaoLaudo())).toBe(hash(await gerarNaoLaudo()));
  });
  it("as variantes são diferentes entre si", async () => {
    const hs = new Set([
      hash(await gerarLaudo({ layout: "novo" })),
      hash(await gerarLaudo({ layout: "antigo" })),
      hash(await gerarLaudo({ layout: "novo", borrar: ["weight"] })),
    ]);
    expect(hs.size).toBe(3);
  });
});
