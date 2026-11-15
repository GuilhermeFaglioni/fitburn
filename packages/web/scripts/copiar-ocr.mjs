// Copia para public/ocr os arquivos do OCR (tesseract.js) servidos pelo próprio app:
// worker, núcleos LSTM (com e sem SIMD) e o modelo de idioma. Nada vem de CDN.
// Roda sozinho antes de `dev` e `build` (ver package.json).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const require = createRequire(join(raiz, "package.json"));
const pacote = (nome) => dirname(require.resolve(`${nome}/package.json`));

const destino = join(raiz, "public", "ocr");
mkdirSync(destino, { recursive: true });

const worker = join(pacote("tesseract.js"), "dist", "worker.min.js");
const core = dirname(createRequire(join(pacote("tesseract.js"), "package.json")).resolve("tesseract.js-core/package.json"));
const arquivos = [
  [worker, "worker.min.js"],
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((n) => [join(core, n), n]),
  [join(raiz, "ocr", "eng.traineddata.gz"), "eng.traineddata.gz"],
];
for (const [de, nome] of arquivos) {
  readFileSync(de); // falha cedo se faltar
  copyFileSync(de, join(destino, nome));
}
console.log(`OCR: ${arquivos.length} arquivos em public/ocr`);
