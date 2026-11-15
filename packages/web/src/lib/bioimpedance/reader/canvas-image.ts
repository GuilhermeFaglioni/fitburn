import { REPORT_HEIGHT, REPORT_WIDTH, type Rect } from "./template";
import type { ReportImage } from "./types";

/**
 * Normaliza a foto/arquivo do laudo para 1420×2000 em escala de cinza com contraste
 * esticado, no navegador (canvas). Os recortes saem ampliados, prontos para o OCR.
 */
export async function loadReportImage(file: Blob): Promise<ReportImage> {
  const bitmap = await createImageBitmap(file);
  const originalAspect = bitmap.width / bitmap.height;

  const base = document.createElement("canvas");
  base.width = REPORT_WIDTH;
  base.height = REPORT_HEIGHT;
  const ctx = base.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, REPORT_WIDTH, REPORT_HEIGHT);
  ctx.drawImage(bitmap, 0, 0, REPORT_WIDTH, REPORT_HEIGHT);
  bitmap.close();

  // cinza + estica o contraste (1º e 99º percentis)
  const img = ctx.getImageData(0, 0, REPORT_WIDTH, REPORT_HEIGHT);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g] += 1;
  }
  const total = REPORT_WIDTH * REPORT_HEIGHT;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.max(0, Math.min(255, Math.round(((d[i] - lo) * 255) / span)));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);

  return {
    originalAspect,
    async crop(rect: Rect, scale = 1) {
      const [x0, y0, x1, y1] = rect;
      const out = document.createElement("canvas");
      out.width = Math.round((x1 - x0) * scale);
      out.height = Math.round((y1 - y0) * scale);
      const c = out.getContext("2d");
      if (!c) throw new Error("Canvas indisponível neste navegador.");
      c.imageSmoothingQuality = "high";
      c.drawImage(base, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
      return out;
    },
  };
}
