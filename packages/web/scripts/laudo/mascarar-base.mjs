// Gera a base totalmente mascarada do laudo InBody120 a partir de um JPG real.
//
// Uso: node scripts/laudo/mascarar-base.mjs <laudo-original.jpg> <saida.png>
//
// O original é dado de saúde: use-o só localmente e NUNCA o commite. Todas as áreas
// do gabarito com dado pessoal (nome, ID, nascimento, datas, valores, barras, histórico,
// QR, impedância, número de série) são apagadas com a cor do fundo ao redor.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const aqui = dirname(fileURLToPath(import.meta.url));
const gabarito = JSON.parse(readFileSync(join(aqui, "../../src/lib/bioimpedance/reader/template.json"), "utf8"));
const [, , entrada, saida] = process.argv;
if (!entrada || !saida) {
  console.error("Uso: node scripts/laudo/mascarar-base.mjs <laudo-original.jpg> <saida.png>");
  process.exit(1);
}

const { width: W, height: H } = gabarito;
const { data } = await sharp(entrada)
  .resize(W, H, { fit: "fill" })
  .flatten({ background: "#ffffff" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const px = Buffer.from(data);

const mediana = (valores) => valores.sort((a, b) => a - b)[Math.floor(valores.length / 2)];

/** Pinta o retângulo com a mediana dos pixels do anel de 4 px ao redor. */
function apagar([x0, y0, x1, y1]) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  const anel = [[], [], []];
  const amostra = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    for (let c = 0; c < 3; c++) anel[c].push(px[(y * W + x) * 3 + c]);
  };
  for (let x = x0; x < x1; x++) for (let d = 2; d <= 5; d++) { amostra(x, y0 - d); amostra(x, y1 + d - 1); }
  for (let y = y0; y < y1; y++) for (let d = 2; d <= 5; d++) { amostra(x0 - d, y); amostra(x1 + d - 1, y); }
  const cor = anel.map(mediana);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) px[(y * W + x) * 3 + c] = cor[c];
}

const segmentares = gabarito.fields
  .filter((f) => /^(lean|fat)(LeftArm|RightArm|Trunk|LeftLeg|RightLeg)/.test(f.key))
  .map(({ rect: [a, b, c, d] }) => [a - 4, b - 2, c + 4, d + 2]);

for (const r of [...gabarito.mask, ...segmentares]) apagar(r);

writeFileSync(saida, await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer());
console.log(`Base mascarada gravada em ${saida} (${W}x${H}).`);
