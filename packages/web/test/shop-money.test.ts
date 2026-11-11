import { centsToInput, formatCents, parseMoneyToCents } from "../src/lib/shop/money";

/** O Intl usa espaço sem quebra entre "R$" e o valor; os testes comparam com espaço comum. */
const plain = (text: string) => text.replace(/ /g, " ");

describe("parseMoneyToCents", () => {
  it.each([
    ["R$ 89,90", 8990],
    ["89,90", 8990],
    ["89.9", 8990],
    ["89.90", 8990],
    ["89", 8900],
    ["  R$89,9 ", 8990],
    ["0,05", 5],
    ["0", 0],
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["1.234", 123400],
    ["1234,5", 123450],
  ])("converte %j em %i centavos", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["", "   ", "abc", "R$", "12,345", "1,2,3", "-5", "10,5x", "1..2", "89,", ",50", "1e3"])(
    "recusa o valor inválido %j",
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );
});

describe("formatCents", () => {
  it("formata em reais (BRL)", () => {
    expect(plain(formatCents(8990))).toBe("R$ 89,90");
    expect(plain(formatCents(5))).toBe("R$ 0,05");
    expect(plain(formatCents(123456))).toBe("R$ 1.234,56");
    expect(plain(formatCents(0))).toBe("R$ 0,00");
  });
});

describe("centsToInput", () => {
  it("devolve o texto de um campo de preço, que parseMoneyToCents lê de volta", () => {
    expect(centsToInput(8990)).toBe("89,90");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(123456)).toBe("1234,56");
    expect(parseMoneyToCents(centsToInput(123456))).toBe(123456);
  });
});
