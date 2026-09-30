import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { APP_OUT, DESIGN_OUT, DIFF_OUT, OUT_DIR } from "./paths.mjs";

const GAP = 12;

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

/** Copia `src` para `dst` na posição (x, y). */
function blit(src, dst, x, y) {
  PNG.bitblt(src, dst, 0, 0, src.width, src.height, x, y);
}

/** Cola a imagem no canto de um canvas w x h (fundo cinza) sem redimensionar. */
function padTo(png, width, height, fill = [40, 40, 40, 255]) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(fill, i);
  blit(png, out, 0, 0);
  return out;
}

/**
 * Compara design x app de cada captura (padrão e variantes com captura no app),
 * gera diff, imagem lado a lado e o report.md ranqueado.
 */
export async function compareAll(captures, { only } = {}) {
  fs.mkdirSync(DIFF_OUT, { recursive: true });
  const capturesMeta = fs.existsSync(path.join(APP_OUT, "_captures.json"))
    ? JSON.parse(fs.readFileSync(path.join(APP_OUT, "_captures.json"), "utf8"))
    : [];
  const meta = Object.fromEntries(capturesMeta.map((m) => [m.id, m]));
  const rows = [];

  for (const capture of captures) {
    if (only && !only.includes(capture.id)) continue;
    const designFile = path.join(DESIGN_OUT, `${capture.id}.png`);
    const appFile = path.join(APP_OUT, `${capture.id}.png`);
    const row = { id: capture.id, group: capture.group, route: meta[capture.id]?.route ?? capture.app?.route ?? "" };
    if (!fs.existsSync(designFile)) {
      rows.push({ ...row, status: "sem render do design" });
      continue;
    }
    if (!fs.existsSync(appFile)) {
      rows.push({ ...row, status: "sem captura do app", error: meta[capture.id]?.error });
      continue;
    }
    const design = readPng(designFile);
    const rawApp = readPng(appFile);
    const app = padTo(rawApp, design.width, design.height);
    const diff = new PNG({ width: design.width, height: design.height });
    const different = pixelmatch(design.data, app.data, diff.data, design.width, design.height, {
      threshold: 0.1,
      includeAA: false,
      diffColor: [255, 0, 90],
      alpha: 0.3,
    });
    const total = design.width * design.height;
    const percent = (different / total) * 100;

    fs.writeFileSync(path.join(DIFF_OUT, `${capture.id}.diff.png`), PNG.sync.write(diff));
    const side = new PNG({ width: design.width * 3 + GAP * 2, height: design.height });
    for (let i = 0; i < side.data.length; i += 4) side.data.set([70, 70, 70, 255], i);
    blit(design, side, 0, 0);
    blit(app, side, design.width + GAP, 0);
    blit(diff, side, (design.width + GAP) * 2, 0);
    fs.writeFileSync(path.join(DIFF_OUT, `${capture.id}.side.png`), PNG.sync.write(side));

    rows.push({
      ...row,
      status: "ok",
      percent,
      different,
      total,
      width: design.width,
      height: design.height,
      appFullHeight: meta[capture.id]?.fullHeight,
    });
  }

  rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
  const reportPath = path.join(OUT_DIR, "report.md");
  fs.writeFileSync(reportPath, renderReport(rows));
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(rows, null, 2));
  return { rows, reportPath };
}

function renderReport(rows) {
  const lines = [
    "# Comparação design x app",
    "",
    `Gerado em ${new Date().toISOString()}. Pixel diferente = pixelmatch (limiar 0,1, sem anti-aliasing).`,
    "Imagens em `tmp/design-compare/diff/<Artboard>.side.png` (design | app | diferença).",
    "",
    "| # | Artboard | Grupo | Rota do app | % pixels diferentes | Altura da página no app (artboard) |",
    "|---|---|---|---|---|---|",
  ];
  rows.forEach((row, i) => {
    if (row.status !== "ok") {
      lines.push(`| ${i + 1} | ${row.id} | ${row.group} | ${row.route} | ${row.status} | |`);
      return;
    }
    const overflow =
      row.appFullHeight && row.appFullHeight !== row.height ? `${row.appFullHeight}px (${row.height}px)` : `${row.height}px`;
    lines.push(
      `| ${i + 1} | ${row.id} | ${row.group} | \`${row.route}\` | ${row.percent.toFixed(2)}% | ${overflow} |`,
    );
  });
  return lines.join("\n") + "\n";
}
