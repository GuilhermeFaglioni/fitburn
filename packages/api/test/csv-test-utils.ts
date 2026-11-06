import type request from "supertest";

/**
 * Utilitários de teste para CSV. O parser é propositalmente independente do
 * serializador (src/exports/csv.ts): se os dois errarem igual, o teste não
 * percebe. Segue o RFC 4180 com ";" como delimitador.
 */

const BOM = "﻿";
const DELIMITER = ";";

/** Parser de corpo binário aceito pelo supertest (o tipo do `Response` do superagent). */
type NodeBodyParser = Extract<Parameters<request.Test["parse"]>[0], (res: never, callback: never) => void>;

/**
 * Faz o supertest devolver o corpo como Buffer (bytes exatos, sem decodificar),
 * para conferir o BOM e a codificação do download.
 */
export function asBinary(test: request.Test): request.Test {
  const parser: NodeBodyParser = (res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  };
  return test.buffer(true).parse(parser);
}

/** O arquivo começa com o BOM UTF-8 (EF BB BF). */
export function hasUtf8Bom(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

/**
 * Lê um CSV com ";" e CRLF, respeitando aspas, aspas dobradas e quebras de linha
 * dentro de campo. Remove o BOM inicial. Lança erro com formação inválida (aspas
 * não fechadas, LF ou CR soltos fora de aspas, texto depois de campo entre aspas).
 */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field !== "" || quoted) {
        throw new Error(`Aspas fora de lugar no CSV (posição ${i}).`);
      }
      inQuotes = true;
      quoted = true;
      continue;
    }

    if (char === DELIMITER) {
      row.push(field);
      field = "";
      quoted = false;
      closedQuote = false;
      continue;
    }

    if (char === "\r") {
      if (text[i + 1] !== "\n") throw new Error(`CR sem LF fora de aspas (posição ${i}).`);
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      quoted = false;
      closedQuote = false;
      i++;
      continue;
    }

    if (char === "\n") throw new Error(`LF sem CR fora de aspas (posição ${i}).`);
    if (closedQuote) throw new Error(`Texto depois de campo entre aspas (posição ${i}).`);
    field += char;
  }

  if (inQuotes) throw new Error("Aspas não fechadas no fim do CSV.");
  if (field !== "" || row.length > 0 || quoted) {
    throw new Error("CSV sem quebra de linha final (CRLF).");
  }
  return rows;
}
