/**
 * Compara as extrações (extract.mjs) do design e do app e lista divergências
 * concretas: textos que faltam/sobram, posição, tipografia, cor, fundo, raio,
 * borda e tamanho da caixa. Textos dinâmicos (nomes, datas) aparecem como
 * "só no design" / "só no app": ignore-os, o que vale é layout e estilo.
 */

const norm = (t) =>
  t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[ .:;,]+$/, "")
    .trim();

function parseColor(value) {
  const m = /rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[,/ ]+\s*([\d.]+%?))?\s*\)/.exec(
    value ?? "",
  );
  if (!m) return null;
  let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

export function sameColor(a, b) {
  if (a === b) return true;
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a === b;
  if (ca[3] === 0 && cb[3] === 0) return true;
  return (
    ca.slice(0, 3).every((v, i) => Math.abs(v - cb[i]) <= 6) && Math.abs(ca[3] - cb[3]) <= 0.04
  );
}

const hex = (c) => {
  const p = parseColor(c);
  if (!p) return c ?? "";
  const h = p
    .slice(0, 3)
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("");
  return p[3] < 1 ? `#${h}/${Math.round(p[3] * 100)}%` : `#${h}`;
};

const px = (v) => (v && v.endsWith("px") ? parseFloat(v) : null);
const cut = (t) => (t.length > 46 ? `${t.slice(0, 43)}...` : t);

function pairTexts(designTexts, appTexts) {
  const byText = new Map();
  for (const t of appTexts) {
    const k = norm(t.text);
    if (!byText.has(k)) byText.set(k, []);
    byText.get(k).push(t);
  }
  const used = new Set();
  const pairs = [];
  const orphans = [];
  const order = (a, b) => a.y - b.y || a.x - b.x;
  const design = [...designTexts].sort(order);
  for (const d of design) {
    const candidates = (byText.get(norm(d.text)) ?? []).filter((c) => !used.has(c));
    if (!candidates.length) {
      orphans.push(d);
      continue;
    }
    candidates.sort(
      (a, b) =>
        Math.abs(a.y - d.y) + Math.abs(a.x - d.x) - (Math.abs(b.y - d.y) + Math.abs(b.x - d.x)),
    );
    used.add(candidates[0]);
    pairs.push([d, candidates[0]]);
  }
  // Segunda chance: texto do design contido no do app (ou o contrário), na mesma região.
  const leftovers = [];
  for (const d of orphans) {
    const nd = norm(d.text);
    const hit = appTexts
      .filter((a) => !used.has(a) && nd.length >= 4)
      .filter(
        (a) => norm(a.text).includes(nd) || (norm(a.text).length >= 4 && nd.includes(norm(a.text))),
      )
      .sort(
        (a, b) =>
          Math.abs(a.y - d.y) + Math.abs(a.x - d.x) - (Math.abs(b.y - d.y) + Math.abs(b.x - d.x)),
      )[0];
    if (hit && Math.abs(hit.y - d.y) < 80) {
      used.add(hit);
      pairs.push([d, hit, true]);
    } else leftovers.push(d);
  }
  return { pairs, missing: leftovers, extra: appTexts.filter((a) => !used.has(a)) };
}

/** Fora da tela (ex.: o link "Ir para o conteúdo", que só aparece com foco) não entra na comparação. */
const onScreen = (t) => t.y + t.h > 0 && t.x + t.w > 0;

export function diffPages(design, app) {
  design = { ...design, texts: design.texts.filter(onScreen) };
  app = { ...app, texts: app.texts.filter(onScreen) };
  const { pairs, missing, extra } = pairTexts(design.texts, app.texts);
  const style = [];
  const position = [];
  for (const [d, a, partial] of pairs) {
    const label = cut(d.text);
    const issues = [];
    if (!partial) {
      if (d.font !== a.font) issues.push(`fonte ${d.font} -> ${a.font}`);
      if (d.size !== a.size) issues.push(`tamanho ${d.size} -> ${a.size}`);
      if (d.weight !== a.weight) issues.push(`peso ${d.weight} -> ${a.weight}`);
      if (!sameColor(d.color, a.color)) issues.push(`cor ${hex(d.color)} -> ${hex(a.color)}`);
      const lhD = px(d.lineHeight);
      const lhA = px(a.lineHeight);
      if (lhD !== null && lhA !== null && Math.abs(lhD - lhA) > 1)
        issues.push(`line-height ${d.lineHeight} -> ${a.lineHeight}`);
      if (
        (d.letterSpacing !== "normal" || a.letterSpacing !== "normal") &&
        d.letterSpacing !== a.letterSpacing
      )
        issues.push(`letter-spacing ${d.letterSpacing} -> ${a.letterSpacing}`);
      if (d.transform !== a.transform)
        issues.push(`text-transform ${d.transform} -> ${a.transform}`);
      if (d.decoration !== a.decoration)
        issues.push(`text-decoration "${d.decoration}" -> "${a.decoration}"`);
    }
    // Caixa que contém o texto.
    const bd = d.box;
    const ba = a.box;
    if (bd && !ba)
      issues.push(
        `caixa: o design tem fundo/borda (${hex(bd.bg)}${bd.border ? `, borda ${bd.border}` : ""}); o app não`,
      );
    else if (!bd && ba)
      issues.push(
        `caixa: o app tem fundo/borda (${hex(ba.bg)}${ba.border ? `, borda ${ba.border}` : ""}); o design não`,
      );
    else if (bd && ba) {
      if (!sameColor(bd.bg, ba.bg))
        issues.push(`fundo da caixa ${hex(bd.bg)} -> ${hex(ba.bg)} (app: ${ba.tag}.${ba.cls})`);
      if (bd.radius !== ba.radius) issues.push(`raio ${bd.radius} -> ${ba.radius}`);
      if (bd.border !== ba.border && !sameBorder(bd.border, ba.border))
        issues.push(`borda "${bd.border}" -> "${ba.border}"`);
      if (Math.abs(bd.w - ba.w) > 3 || Math.abs(bd.h - ba.h) > 3)
        issues.push(`caixa ${bd.w}x${bd.h} -> ${ba.w}x${ba.h}`);
      if (bd.shadow !== ba.shadow) issues.push(`sombra "${bd.shadow}" -> "${ba.shadow}"`);
    }
    if (issues.length) style.push({ text: label, at: `(${d.x},${d.y})`, issues, tag: a.tag });
    const dx = a.x - d.x;
    const dy = a.y - d.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2)
      position.push({ text: label, design: [d.x, d.y], app: [a.x, a.y], dx, dy });
  }
  const iconsD = design.icons.length;
  const iconsA = app.icons.length;
  return { pairs: pairs.length, style, position, missing, extra, iconsD, iconsA };
}

function sameBorder(a, b) {
  if (a === b) return true;
  const [wa, sa, ...ca] = (a || "").split(" ");
  const [wb, sb, ...cb] = (b || "").split(" ");
  return wa === wb && sa === sb && sameColor(ca.join(" "), cb.join(" "));
}

export function renderDiff(key, result, meta) {
  const L = [`# ${key}`, ""];
  L.push(
    `Textos pareados: ${result.pairs}. Com divergência de estilo/caixa: ${result.style.length}. Deslocados (>2px): ${result.position.length}.` +
      ` Só no design: ${result.missing.length}. Só no app: ${result.extra.length}. Ícones: design ${result.iconsD}, app ${result.iconsA}.`,
  );
  if (meta) L.push("", meta);
  L.push("", "## Estilo, tipografia e caixas (texto: design -> app)", "");
  if (!result.style.length) L.push("Nenhuma.");
  for (const s of result.style) L.push(`- "${s.text}" ${s.at}: ${s.issues.join("; ")}`);
  L.push("", "## Posição (x, y: design -> app)", "");
  if (!result.position.length) L.push("Nenhuma.");
  for (const p of result.position.slice(0, 60))
    L.push(
      `- "${p.text}": (${p.design.join(", ")}) -> (${p.app.join(", ")}) [dx ${p.dx}, dy ${p.dy}]`,
    );
  if (result.position.length > 60) L.push(`- ... mais ${result.position.length - 60}`);
  L.push("", "## Textos só no design (faltam no app ou são dinâmicos)", "");
  if (!result.missing.length) L.push("Nenhum.");
  for (const t of result.missing.slice(0, 80))
    L.push(`- "${cut(t.text)}" (${t.x}, ${t.y}) ${t.size}/${t.weight} ${hex(t.color)}`);
  L.push("", "## Textos só no app (sobram ou são dinâmicos)", "");
  if (!result.extra.length) L.push("Nenhum.");
  for (const t of result.extra.slice(0, 80))
    L.push(`- "${cut(t.text)}" (${t.x}, ${t.y}) ${t.size}/${t.weight} ${hex(t.color)}`);
  return L.join("\n") + "\n";
}
