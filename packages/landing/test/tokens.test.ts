import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIST, ROOT, WEB_TOKENS, walk } from "./helpers";

const read = (path: string) => readFileSync(path, "utf8");
const appTokens = read(WEB_TOKENS);
const landingTokens = read(join(ROOT, "src/styles/landing-tokens.css"));
const baseCss = read(join(ROOT, "src/styles/base.css"));

/** Declarações `--nome: valor` de um bloco de CSS. */
function declarations(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Corpo do bloco que começa em `selector {`. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`bloco não encontrado: ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`bloco sem fim: ${selector}`);
}

const light = declarations(block(appTokens, ":root"));
const lightColors = declarations(appTokens.slice(appTokens.indexOf("color-scheme: light")));
const dark = declarations(block(appTokens, ':root[data-theme="dark"]'));
const token = (name: string) => {
  const value = dark[name] ?? lightColors[name] ?? light[name];
  if (!value) throw new Error(`token ${name} não existe`);
  return value;
};

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Remove regras `:root...{}` (os tokens), inclusive aninhadas em @media. */
function withoutRootRules(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const rootAt = css.indexOf(":root", i);
    if (rootAt < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, rootAt);
    const open = css.indexOf("{", rootAt);
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      if (css[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

/** Procura valores literais: cor, rgb() e px (exceto 0, 1px de borda e 2px do anel de foco; @media fica de fora). */
function literals(css: string): string[] {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]+/g, "")
    .replace(/@supports[^{]+/g, "");
  const found: string[] = [];
  // `#0000` é o `transparent` que o minificador reescreve; não é cor de marca.
  for (const m of clean.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (m[0] !== "#0000") found.push(m[0]);
  for (const m of clean.matchAll(/\brgba?\(/g)) found.push(m[0]);
  for (const m of clean.matchAll(/(?<![\w.-])(\d*\.?\d+)px\b/g)) {
    if (!["0", "1", "2"].includes(m[1])) found.push(m[0]);
  }
  return found;
}

const astroFiles = walk(join(ROOT, "src"))
  .filter((f) => f.endsWith(".astro"))
  .map((f) => join(ROOT, "src", f));

describe("tokens e estilo", () => {
  it("base.css importa o tokens.css do app e os tokens da landing", () => {
    expect(baseCss).toMatch(/^@import "\.\.\/\.\.\/\.\.\/web\/src\/styles\/tokens\.css";/);
    expect(baseCss).toContain('@import "./landing-tokens.css";');
  });

  it("nenhum arquivo da landing redeclara token do app", () => {
    const appNames = Object.keys({ ...light, ...lightColors, ...dark });
    const own = Object.keys(declarations(landingTokens));
    for (const name of appNames) expect(own, name).not.toContain(name);
    const files = [...walk(join(ROOT, "src")).filter((f) => /\.(css|astro)$/.test(f)).map((f) => join(ROOT, "src", f))];
    for (const file of files) {
      if (file.endsWith("landing-tokens.css")) continue;
      for (const name of appNames) {
        expect(new RegExp(`${name}\\s*:`).test(read(file)), `${name} em ${file}`).toBe(false);
      }
    }
  });

  it("landing-tokens.css tem exatamente os tokens da 3.2", () => {
    expect(Object.keys(declarations(landingTokens))).toEqual([
      "--text-h2-marketing",
      "--leading-h2-marketing",
      "--text-hero-sub",
      "--text-lead",
      "--text-cta",
      "--cta-min-h",
      "--cta-ink",
      "--landing-max",
      "--landing-gutter",
      "--landing-gutter-lg",
      "--section-y",
      "--section-y-lg",
      "--reveal-shift",
      "--action-bar-h",
    ]);
    expect(declarations(landingTokens)["--cta-ink"]).toBe("#0A0A0A");
    expect(landingTokens).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("cada token novo tem um comentário com o motivo", () => {
    const body = block(landingTokens, ":root");
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      if (line.startsWith("--") && /^--(text-h2-marketing|text-hero-sub|text-lead|text-cta|cta-min-h|cta-ink|landing-max|section-y|reveal-shift|action-bar-h):/.test(line)) {
        expect(lines[i - 1], line).toMatch(/^\/\*/);
      }
    });
  });

  it("sem cor hex, rgb() nem px literal nos CSS e nos <style> da landing", () => {
    const sources = [
      ["base.css", baseCss],
      ...astroFiles.map((file) => [file, (read(file).match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join("\n")]),
    ];
    for (const [name, css] of sources) expect(literals(css), name).toEqual([]);
  });

  it("sem cor hex, rgb() nem px literal nos CSS do build (fora dos tokens)", () => {
    const files = readdirSync(join(DIST, "_astro")).filter((f) => f.endsWith(".css"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const css = withoutRootRules(read(join(DIST, "_astro", file)));
      expect(literals(css), file).toEqual([]);
    }
  });

  it("public/flame.svg é idêntico ao do app", () => {
    const own = readFileSync(join(ROOT, "public/flame.svg"));
    const app = readFileSync(join(ROOT, "../web/public/flame.svg"));
    expect(own.equals(app)).toBe(true);
  });

  it("o botão primário e o texto de apoio passam no contraste AA", () => {
    const ink = declarations(landingTokens)["--cta-ink"];
    expect(contrast(ink, token("--brand"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, token("--brand-hover"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--muted"), token("--surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--muted"), token("--surface-2"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--muted"), token("--bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--brand-strong"), token("--bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--brand-strong"), token("--surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--brand"), token("--surface"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("--ink-2"), token("--bg"))).toBeGreaterThanOrEqual(4.5);
  });
});
