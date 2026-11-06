import { serializeCsv } from "../src/exports/csv.js";

const BOM = "﻿";

describe("serializeCsv: formato", () => {
  it("começa com BOM, usa ';' e CRLF inclusive na última linha", () => {
    const csv = serializeCsv(["a", "b"], [[1, "x"]]);

    expect(csv).toBe(`${BOM}a;b\r\n1;x\r\n`);
  });

  it("gera só o cabeçalho quando não há linhas", () => {
    expect(serializeCsv(["a", "b"], [])).toBe(`${BOM}a;b\r\n`);
  });

  it("célula null vira campo vazio", () => {
    expect(serializeCsv(["a", "b", "c"], [[null, "x", null]])).toBe(`${BOM}a;b;c\r\n;x;\r\n`);
  });
});

describe("serializeCsv: escape", () => {
  it.each([
    ["ponto e vírgula", "Yoga;Pilates", '"Yoga;Pilates"'],
    ["aspas", 'Aula "Forte"', '"Aula ""Forte"""'],
    ["quebra de linha LF", "linha1\nlinha2", '"linha1\nlinha2"'],
    ["retorno de carro CR", "linha1\rlinha2", '"linha1\rlinha2"'],
  ])("entre aspas quando o texto tem %s, dobrando aspas internas", (_label, value, expected) => {
    expect(serializeCsv(["aula"], [[value]])).toBe(`${BOM}aula\r\n${expected}\r\n`);
  });

  it("não coloca aspas em texto comum", () => {
    expect(serializeCsv(["aula"], [["Treino Funcional"]])).toBe(`${BOM}aula\r\nTreino Funcional\r\n`);
  });
});

describe("serializeCsv: números", () => {
  it("usa vírgula decimal e não recebe prefixo", () => {
    expect(serializeCsv(["p"], [[87.5], [100], [0], [-5]])).toBe(
      `${BOM}p\r\n87,5\r\n100\r\n0\r\n-5\r\n`,
    );
  });

  it.each([NaN, Infinity, -Infinity])("rejeita %s", (value) => {
    expect(() => serializeCsv(["p"], [[value]])).toThrow();
  });
});

describe("serializeCsv: proteção contra injeção de fórmula", () => {
  it.each([
    ["=", "=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\""],
    ["+", "+5", "'+5"],
    ["-", "-Yoga", "'-Yoga"],
    ["@", "@SUM(A1)", "'@SUM(A1)"],
    ["TAB", "\tcmd", "'\tcmd"],
  ])("prefixa com ' texto que começa com %s", (_label, value, expected) => {
    expect(serializeCsv(["aula"], [[value]])).toBe(`${BOM}aula\r\n${expected}\r\n`);
  });

  it("prefixa também quando o texto começa com CR (e aplica o escape de aspas)", () => {
    expect(serializeCsv(["aula"], [["\rx"]])).toBe(`${BOM}aula\r\n"'\rx"\r\n`);
  });

  it("protege também os cabeçalhos", () => {
    expect(serializeCsv(["=coluna"], [])).toBe(`${BOM}'=coluna\r\n`);
  });

  it("não mexe em texto que só contém esses caracteres no meio", () => {
    expect(serializeCsv(["aula"], [["Yoga + Pilates @ casa"]])).toBe(
      `${BOM}aula\r\nYoga + Pilates @ casa\r\n`,
    );
  });
});

describe("serializeCsv: integridade", () => {
  it("lança erro quando uma linha tem número de células diferente das colunas", () => {
    expect(() => serializeCsv(["a", "b"], [["só um"]])).toThrow();
    expect(() => serializeCsv(["a"], [["x", "y"]])).toThrow();
  });

  it("não descarta nem corta linhas: 1.500 linhas voltam todas", () => {
    const rows = Array.from({ length: 1500 }, (_, i) => [i, `Aula ${i}`]);

    const csv = serializeCsv(["n", "aula"], rows);
    const lines = csv.slice(BOM.length).split("\r\n");

    // cabeçalho + 1500 linhas + o "" depois do último CRLF
    expect(lines).toHaveLength(1502);
    expect(lines[1500]).toBe("1499;Aula 1499");
  });
});
