// @vitest-environment node
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error script em .mjs, sem tipos
import { VALORES_SINTETICOS, gerarLaudo, gerarNaoLaudo } from "../../../../scripts/laudo/gerar-sinteticos.mjs";
import { createOcrEngine } from "./ocr";
import { readReport } from "./read-report";
import { REPORT_HEIGHT, REPORT_WIDTH, type Rect } from "./template";
import type { OcrEngine, ReadResult, ReportImage } from "./types";

const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const corePath = dirname(createRequire(require.resolve("tesseract.js/package.json")).resolve("tesseract.js-core/package.json"));
const langPath = join(aqui, "../../../../ocr");

/** Mesma normalização do navegador (1420×2000, cinza, contraste), feita com sharp nos testes. */
async function imagemDe(png: Buffer): Promise<ReportImage> {
  const meta = await sharp(png).metadata();
  const base = await sharp(png)
    .resize(REPORT_WIDTH, REPORT_HEIGHT, { fit: "fill" })
    .flatten({ background: "#fff" })
    .grayscale()
    .normalise({ lower: 1, upper: 99 })
    .png()
    .toBuffer();
  return {
    originalAspect: (meta.width ?? 1) / (meta.height ?? 1),
    async crop(rect: Rect, scale = 1) {
      const [x0, y0, x1, y1] = rect;
      return sharp(base)
        .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
        .resize(Math.round((x1 - x0) * scale))
        .png()
        .toBuffer();
    },
  };
}

const valorEsperado = (chave: string): number | string | undefined => {
  const h = VALORES_SINTETICOS.header;
  if (chave === "height") return Number(h.height);
  if (chave === "age") return Number(h.age);
  if (chave === "measuredAt") return "2027-03-15T09:30";
  if (chave.endsWith("Rating")) return VALORES_SINTETICOS.ratings[chave.replace(/Rating$/, "")];
  return VALORES_SINTETICOS.numeros[chave];
};

const campo = (r: ReadResult, chave: string) => r.fields.find((f) => f.key === chave);

describe("leitor do laudo InBody120 (OCR real sobre laudos sintéticos)", () => {
  let ocr: OcrEngine;
  beforeAll(async () => {
    ocr = await createOcrEngine({ corePath, langPath });
  }, 60_000);
  afterAll(async () => {
    await ocr?.terminate();
  });

  it("layout novo: lê campo a campo, com Massa livre de gordura", async () => {
    const r = await readReport(await imagemDe(await gerarLaudo({ layout: "novo" })), ocr);
    expect(r.looksLikeReport).toBe(true);
    expect(r.warning).toBeNull();
    // regra de ouro: campo "ok" nunca vem com valor errado; na dúvida, "conferir"
    const errados: string[] = [];
    let ok = 0;
    let total = 0;
    for (const f of r.fields) {
      const esperado = valorEsperado(f.key);
      if (esperado === undefined) continue;
      total += 1;
      if (f.status === "ok") ok += 1;
      if (f.status === "ok" && f.value !== esperado) errados.push(`${f.key}: leu ${JSON.stringify(f.value)}, esperado ${esperado}`);
    }
    expect(errados).toEqual([]);
    expect(total).toBeGreaterThanOrEqual(60);
    expect(ok / total).toBeGreaterThanOrEqual(0.85);
    // os campos principais precisam vir lidos e confiáveis
    for (const [chave, valor] of Object.entries({ weight: 82.4, bodyFatMass: 20.8, totalBodyWater: 45.1, protein: 12.2, minerals: 4.3, bmi: 26, bodyFatPercent: 25.2 })) {
      expect(campo(r, chave), chave).toMatchObject({ value: valor, status: "ok" });
    }
    // Massa livre de gordura existe neste layout: lida, nunca "ausente"
    expect(campo(r, "fatFreeMass")).toMatchObject({ value: 61.6 });
    expect(campo(r, "fatFreeMass")?.status).not.toBe("missing");
  }, 180_000);

  it("layout antigo: sem Massa livre de gordura, o resto continua lido", async () => {
    const r = await readReport(await imagemDe(await gerarLaudo({ layout: "antigo" })), ocr);
    expect(r.looksLikeReport).toBe(true);
    expect(campo(r, "fatFreeMass")).toMatchObject({ value: null, status: "missing" });
    expect(campo(r, "skeletalMuscleMass")).toMatchObject({ value: 36, status: "ok" });
    expect(campo(r, "basalMetabolicRate")).toMatchObject({ value: 1710, status: "ok" });
    expect(campo(r, "weight")).toMatchObject({ value: 82.4, status: "ok" });
  }, 180_000);

  it("dígito borrado vira 'conferir' e não chega como valor confiável", async () => {
    const r = await readReport(await imagemDe(await gerarLaudo({ layout: "novo", borrar: ["weight"] })), ocr);
    const peso = campo(r, "weight");
    expect(peso?.status).toBe("check");
    // o vizinho intacto segue confiável
    expect(campo(r, "bodyFatMass")).toMatchObject({ value: 20.8, status: "ok" });
  }, 180_000);

  it("imagem que não é laudo: avisa e não devolve campos", async () => {
    const r = await readReport(await imagemDe(await gerarNaoLaudo()), ocr);
    expect(r.looksLikeReport).toBe(false);
    expect(r.warning).toMatch(/não parece um laudo/i);
    expect(r.fields).toEqual([]);
  }, 60_000);

  it("proporção muito diferente da de um laudo também é rejeitada", async () => {
    const larga = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#fff" } }).png().toBuffer();
    const r = await readReport(await imagemDe(larga), ocr);
    expect(r.looksLikeReport).toBe(false);
  }, 60_000);
});
