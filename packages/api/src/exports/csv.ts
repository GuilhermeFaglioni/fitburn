/**
 * Serialização CSV comum às exportações (ocupação, faturamento, reservas).
 * Regras e motivo de cada uma: docs/exportacoes-csv.md.
 *
 * Números não recebem prefixo e saem com vírgula decimal; texto que começa com
 * caractere de fórmula ganha `'` na frente (proteção contra injeção no Excel e
 * no Planilhas do Google). Nada é cortado: o período é que limita as linhas.
 */
export type CsvCell = string | number | null;

const BOM = "\uFEFF";
const DELIMITER = ";";
const NEWLINE = "\r\n";
const FORMULA_PREFIX_CHARS = ["=", "+", "-", "@", "\t", "\r"];
const QUOTE_TRIGGER = /[;"\r\n]/;

export function serializeCsv(columns: readonly string[], rows: readonly CsvCell[][]): string {
  const lines = [
    columns.map((column) => escapeText(column)),
    ...rows.map((row, index) => {
      if (row.length !== columns.length) {
        throw new Error(
          `Linha ${index + 1} do CSV tem ${row.length} células; o cabeçalho tem ${columns.length}.`,
        );
      }
      return row.map(escapeCell);
    }),
  ];
  return BOM + lines.map((cells) => cells.join(DELIMITER) + NEWLINE).join("");
}

function escapeCell(cell: CsvCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return formatNumber(cell);
  return escapeText(cell);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Número inválido no CSV: ${value}.`);
  }
  return String(value).replace(".", ",");
}

function escapeText(value: string): string {
  const guarded = FORMULA_PREFIX_CHARS.some((char) => value.startsWith(char))
    ? `'${value}`
    : value;
  if (!QUOTE_TRIGGER.test(guarded)) return guarded;
  return `"${guarded.replaceAll('"', '""')}"`;
}
