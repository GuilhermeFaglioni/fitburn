import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dist, root, walk } from "./helpers";

const read = (p: string) => readFileSync(p, "utf8");
const appTokens = read(join(root, "../web/src/styles/tokens.css"));
const landingTokens = read(join(root, "src/styles/landing-tokens.css"));
const baseCss = read(join(root, "src/styles/base.css"));

/** Remove blocos :root (tokens) e as condições de @media, onde px e hex são permitidos. */
function stripAllowed(css: string): string {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]*;/g, "");
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/:root[^{}]*\{[^{}]*\}/g, "");
  }
  return out.replace(/@(media|supports)[^{]*\{/g, "{");
}

function violations(css: string): string[] {
  const c = stripAllowed(css);
  const v: string[] = [];
  // #0000 é o `transparent` que o minificador reescreve.
  for (const m of c.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (m[0] !== "#0000") v.push(`hex ${m[0]}`);
  for (const m of c.matchAll(/\brgba?\(/g)) v.push(`rgb ${m[0]}`);
  for (const m of c.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)) if (m[1] !== "0" && m[1] !== "1") v.push(`px ${m[0]}`);
  return v;
}

function srcAstroStyles(): string[] {
  return walk(join(root, "src"))
    .filter((f) => f.endsWith(".astro"))
    .flatMap((f) => [...read(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]!));
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
function token(css: string, name: string, scope?: string): string {
  const block = scope ? css.slice(css.indexOf(scope)) : css;
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token ${name} não encontrado`);
  return m[1]!;
}
const dark = (n: string) => token(appTokens, n, ':root[data-theme="dark"]');

describe("tokens e CSS", () => {
  it("base.css importa os tokens do app e depois os da landing", () => {
    expect(baseCss).toContain('@import "../../../web/src/styles/tokens.css";');
    expect(baseCss).toContain('@import "./landing-tokens.css";');
  });

  it("nenhum arquivo da landing redeclara token do app", () => {
    const appNames = [...appTokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!);
    const landingNames = new Set([...landingTokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!));
    for (const n of landingNames) expect(appNames, n).not.toContain(n);
    for (const n of new Set(appNames)) expect(baseCss, n).not.toMatch(new RegExp(`^\\s*${n}:`, "m"));
  });

  it("landing-tokens.css tem exatamente os tokens da 3.2", () => {
    const names = [...landingTokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
    expect(names).toEqual([
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
      "--reveal-shift",
    ]);
  });

  it("src/styles/base.css e <style> dos .astro não têm hex, rgb nem px literal", () => {
    expect(violations(baseCss)).toEqual([]);
    for (const s of srcAstroStyles()) expect(violations(s)).toEqual([]);
  });

  it("os CSS do dist não têm hex, rgb nem px literal fora de :root e media", () => {
    const css = readdirSync(join(dist, "_astro")).filter((f) => f.endsWith(".css"));
    expect(css.length).toBeGreaterThan(0);
    for (const f of css) {
      // @font-face dos pacotes @fontsource não tem px/hex; tokens do app ficam em :root.
      expect(violations(read(join(dist, "_astro", f))), f).toEqual([]);
    }
  });

  it("flame.svg é idêntico ao do app", () => {
    expect(readFileSync(join(root, "public/flame.svg")).equals(readFileSync(join(root, "../web/public/flame.svg")))).toBe(true);
  });

  it("contrastes WCAG do tema escuro", () => {
    const ink = token(landingTokens, "--cta-ink");
    expect(contrast(ink, token(appTokens, "--brand"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, dark("--brand-hover"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark("--muted"), dark("--surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark("--muted"), dark("--bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark("--brand-strong"), dark("--bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(appTokens, "--brand"), dark("--surface"))).toBeGreaterThanOrEqual(3);
  });
});
