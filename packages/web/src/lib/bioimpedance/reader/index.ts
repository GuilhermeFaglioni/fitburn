import { loadReportImage } from "./canvas-image";
import { createOcrEngine } from "./ocr";
import { readReport } from "./read-report";
import type { ReadResult } from "./types";

export { REPORT_TEMPLATE } from "./template";
export type { ReadField, ReadResult } from "./types";
export { MIN_CONFIDENCE, NOT_REPORT_WARNING } from "./read-report";

/** Lê o laudo InBody120 de um JPG/PNG, no navegador. O OCR só é baixado agora. */
export async function readReportFile(file: Blob): Promise<ReadResult> {
  const image = await loadReportImage(file);
  const ocr = await createOcrEngine();
  try {
    return await readReport(image, ocr);
  } finally {
    await ocr.terminate();
  }
}
