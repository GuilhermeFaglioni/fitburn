import type { Response } from "express";

/**
 * Envia o CSV como anexo UTF-8. O BOM já vem no próprio texto (serializeCsv),
 * então o navegador e o Excel abrem com acentuação certa.
 */
export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename(filename)}"`);
  res.send(csv);
}

/** Nome seguro para o cabeçalho: só ASCII sem aspas, barras ou espaços. */
function asciiFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, "_");
}
