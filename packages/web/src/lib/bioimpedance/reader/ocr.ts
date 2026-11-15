import type { OcrEngine, OcrKind, OcrLine, OcrResult } from "./types";

export interface OcrPaths {
  /** URL (ou pasta, em Node) do worker.min.js. */
  workerPath?: string;
  /** Pasta com os núcleos `tesseract-core-*-lstm.wasm.js`. */
  corePath: string;
  /** Pasta com `eng.traineddata.gz`. */
  langPath: string;
}

/** Arquivos servidos pelo próprio app (copiados para `public/ocr` no dev/build). Nada de CDN. */
export function appOcrPaths(base: string = import.meta.env.BASE_URL): OcrPaths {
  const pasta = `${base.replace(/\/$/, "")}/ocr`;
  return { workerPath: `${pasta}/worker.min.js`, corePath: pasta, langPath: pasta };
}

/**
 * Cria o motor de OCR. O `tesseract.js` (e o modelo, ~2 MB) só é baixado aqui,
 * na primeira leitura de um laudo, nunca no carregamento do app.
 */
export async function createOcrEngine(paths: OcrPaths = appOcrPaths()): Promise<OcrEngine> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    ...(paths.workerPath ? { workerPath: paths.workerPath } : {}),
    corePath: paths.corePath,
    langPath: paths.langPath,
    gzip: true,
    cacheMethod: "none",
  });
  // recortes não têm DPI: fixa um valor para o tesseract não reclamar nem estimar
  await worker.setParameters({ user_defined_dpi: "300" });
  let kindAtual: OcrKind | null = null;

  return {
    async recognize(image, kind): Promise<OcrResult> {
      if (kind !== kindAtual) {
        await worker.setParameters({
          tessedit_pageseg_mode: kind === "number" ? PSM.SINGLE_LINE : PSM.SPARSE_TEXT,
        });
        kindAtual = kind;
      }
      const { data } = await worker.recognize(image as never, {}, { blocks: true });
      const lines: OcrLine[] = [];
      let minConf = 100;
      let words = 0;
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            lines.push({
              text: line.text.trim(),
              confidence: line.confidence,
              bbox: [line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1],
              words: line.words.map((w) => ({ text: w.text, confidence: w.confidence })),
            });
            for (const w of line.words) {
              words += 1;
              minConf = Math.min(minConf, w.confidence);
            }
          }
        }
      }
      return { text: data.text.trim(), confidence: words ? minConf : 0, lines };
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
