import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { diffPages, renderDiff } from "./divergences.mjs";
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

  const jobs = [];
  for (const capture of captures) {
    if (only && !only.includes(capture.id)) continue;
    jobs.push({ capture, key: capture.id, variant: false });
    for (const v of capture.app?.variants ?? []) {
      jobs.push({ capture, key: `${capture.id}__${v.name}`, variant: true });
    }
  }
  for (const { capture, key, variant } of jobs) {
    const designFile = path.join(DESIGN_OUT, `${key}.png`);
    const appFile = path.join(APP_OUT, `${key}.png`);
    const row = {
      id: key,
      variant,
      group: capture.group,
      route: meta[key]?.route ?? capture.app?.route ?? "",
      stepError: meta[key]?.stepError,
    };
    if (!fs.existsSync(designFile)) {
      rows.push({ ...row, status: "sem render do design" });
      continue;
    }
    if (!fs.existsSync(appFile)) {
      rows.push({ ...row, status: "sem captura do app", error: meta[key]?.error });
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
    // Só o "conteúdo": pixels que não são o fundo predominante em nenhuma das duas imagens.
    const content = countContent(design, app);
    const contentPercent = content ? Math.min(100, (different / content) * 100) : 0;

    fs.writeFileSync(path.join(DIFF_OUT, `${key}.diff.png`), PNG.sync.write(diff));
    const side = new PNG({ width: design.width * 3 + GAP * 2, height: design.height });
    for (let i = 0; i < side.data.length; i += 4) side.data.set([70, 70, 70, 255], i);
    blit(design, side, 0, 0);
    blit(app, side, design.width + GAP, 0);
    blit(diff, side, (design.width + GAP) * 2, 0);
    fs.writeFileSync(path.join(DIFF_OUT, `${key}.side.png`), PNG.sync.write(side));

    let divergences;
    const dj = path.join(DESIGN_OUT, `${key}.json`);
    const aj = path.join(APP_OUT, `${key}.json`);
    if (fs.existsSync(dj) && fs.existsSync(aj)) {
      const result = diffPages(
        JSON.parse(fs.readFileSync(dj, "utf8")),
        JSON.parse(fs.readFileSync(aj, "utf8")),
      );
      fs.mkdirSync(path.join(OUT_DIR, "divergences"), { recursive: true });
      const note = describeMeta(meta[key]);
      fs.writeFileSync(
        path.join(OUT_DIR, "divergences", `${key}.md`),
        renderDiff(key, result, note),
      );
      divergences = {
        pairs: result.pairs,
        style: result.style.length,
        position: result.position.length,
        missing: result.missing.length,
        extra: result.extra.length,
      };
    }
    rows.push({
      ...row,
      divergences,
      status: "ok",
      percent,
      contentPercent,
      different,
      total,
      width: design.width,
      height: design.height,
      appFullHeight: meta[key]?.fullHeight,
    });
  }

  rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
  const reportPath = path.join(OUT_DIR, "report.md");
  fs.writeFileSync(reportPath, renderReport(rows));
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(rows, null, 2));
  return { rows, reportPath };
}

function describeMeta(m) {
  if (!m) return "";
  const parts = [];
  if (m.route) parts.push(`Rota do app: \`${m.route}\`.`);
  if (m.fullHeight) parts.push(`Altura total da página no app: ${m.fullHeight}px.`);
  if (m.stepError) parts.push(`Passo de captura falhou: ${m.stepError}.`);
  return parts.join(" ");
}

function dominantColor(png) {
  const counts = new Map();
  for (let i = 0; i < png.data.length; i += 4 * 7) {
    const k = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function countContent(a, b) {
  const bgA = dominantColor(a);
  const bgB = dominantColor(b);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const ka = (a.data[i] << 16) | (a.data[i + 1] << 8) | a.data[i + 2];
    const kb = (b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2];
    if (ka !== bgA || kb !== bgB) n++;
  }
  return n;
}

function counts(d) {
  return d ? `${d.style} / ${d.position} / ${d.missing} / ${d.extra}` : "";
}

function table(rows, title) {
  const lines = [
    `## ${title}`,
    "",
    "| # | Tela | Grupo | Rota do app | % pixels diferentes | % do conteúdo | Estilo / posição / só design / só app | Altura da página no app (artboard) |",
    "|---|---|---|---|---|---|---|---|",
  ];
  rows.forEach((row, i) => {
    if (row.status !== "ok") {
      lines.push(
        `| ${i + 1} | ${row.id} | ${row.group} | \`${row.route}\` | ${row.status} | | | |`,
      );
      return;
    }
    const overflow =
      row.appFullHeight && row.appFullHeight !== row.height
        ? `${row.appFullHeight}px (${row.height}px)`
        : `${row.height}px`;
    const note = row.stepError ? " (passo falhou)" : "";
    lines.push(
      `| ${i + 1} | ${row.id}${note} | ${row.group} | \`${row.route}\` | ${row.percent.toFixed(2)}% | ${row.contentPercent.toFixed(1)}% | ${counts(row.divergences)} | ${overflow} |`,
    );
  });
  return lines.join("\n");
}

function renderReport(rows) {
  const main = rows.filter((r) => !r.variant);
  const variants = rows.filter((r) => r.variant);
  return (
    [
      "# Comparação design x app",
      "",
      `Gerado em ${new Date().toISOString()}. Pixel diferente = pixelmatch (limiar 0,1, sem anti-aliasing).`,
      "`% do conteúdo` = pixels diferentes / pixels que não são fundo em nenhuma das imagens (evita que telas escuras pareçam mais parecidas do que são).",
      "Imagens em `tmp/design-compare/diff/<Tela>.side.png` (design | app | diferença); medidas em `tmp/design-compare/divergences/<Tela>.md`. Ranqueadas da mais para a menos divergente (% pixels diferentes).",
      "",
      table(main, "Artboards (estado padrão)"),
      "",
      table(variants, "Estados alternativos"),
    ].join("\n") + "\n"
  );
}
