const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Lê um valor em reais digitado pela equipe ("R$ 89,90", "89,90", "89.9", "1.234,56") e devolve centavos inteiros.
 * Devolve `null` para vazio ou valor inválido (letras, negativo, mais de 2 casas decimais, separadores soltos).
 * Com vírgula, a vírgula é o decimal e os pontos são milhares; só com pontos, um grupo de 3 dígitos depois do
 * último ponto é milhar ("1.234" = 1234 reais) e 1 ou 2 dígitos são decimais ("89.9" = 89,90).
 */
export function parseMoneyToCents(input: string): number | null {
  const text = input.replace(/^\s*R\$/, "").replace(/\s+/g, "");
  if (text === "") return null;

  let integerPart: string;
  let fraction = "";
  if (text.includes(",")) {
    const match = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(text);
    if (!match) return null;
    integerPart = match[1]!.replace(/\./g, "");
    fraction = match[2]!;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    integerPart = text.replace(/\./g, "");
  } else {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) return null;
    integerPart = match[1]!;
    fraction = match[2] ?? "";
  }

  const cents = Number(integerPart) * 100 + Number(fraction.padEnd(2, "0") || 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos em reais para exibição: "R$ 89,90". */
export function formatCents(cents: number): string {
  return BRL.format(cents / 100);
}

/** Centavos como texto de um campo de preço ("89,90"), sem o símbolo, para a edição. */
export function centsToInput(cents: number): string {
  const reais = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${reais},${rest}`;
}
