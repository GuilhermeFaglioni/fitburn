import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loja do cliente (L4, #193): só tokens (sem cor, raio, espaçamento, fonte ou sombra literal e sem estilo inline) e
 * a rolagem suave da galeria some com movimento reduzido. Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const css = code(readFileSync(join(root, "src/styles/shop.css"), "utf8"));
const pagesDir = join(root, "src/pages/loja");
const sources = readdirSync(pagesDir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => [name, code(readFileSync(join(pagesDir, name), "utf8"))] as const);

describe("shop.css: só tokens", () => {
  it("não tem cor literal", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
  });

  it("raio, fonte e sombra vêm de tokens", () => {
    for (const [, value] of css.matchAll(/border-radius:\s*([^;]+);/g)) expect(value).toMatch(/var\(--r-/);
    for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) expect(value).toMatch(/var\(--text-/);
    for (const [, value] of css.matchAll(/(?<![-\w])box-shadow:\s*([^;]+);/g))
      expect(value).toMatch(/var\(--sh-/);
    expect(css).not.toMatch(/font-family:\s*["']/);
  });

  it("espaçamento (padding, margin, gap) vem dos tokens --s-N", () => {
    for (const [, value] of css.matchAll(/(?<![-\w])(?:padding|margin|gap)(?:-[a-z]+)?:\s*([^;]+);/g)) {
      const withoutTokens = value.replace(/var\(--s-\d+\)/g, "").replace(/calc\([^)]*\)/g, "");
      expect(withoutTokens.replace(/\b(0|auto)\b/g, "").match(/\d+(\.\d+)?px/g) ?? [], value).toEqual([]);
    }
  });

  it("a rolagem suave da galeria some com movimento reduzido", () => {
    expect(css).toMatch(/scroll-behavior:\s*smooth/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.fb-loja-gallery__track\s*\{[^}]*scroll-behavior:\s*auto/);
  });
});

describe("telas da loja: sem estilo literal no TSX", () => {
  it.each(sources)("%s não tem cor literal nem estilo inline", (_name, source) => {
    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source).not.toMatch(/\bstyle=\{/);
  });

  it("reaproveitam os componentes da base e os estados compartilhados", () => {
    const all = sources.map(([, source]) => source).join("\n");
    for (const component of ["ui/Alert", "ui/Badge", "ui/Button", "ui/Field", "ui/Pill", "ui/States", "QueryBlockState"]) {
      expect(all).toContain(`components/${component}`);
    }
  });
});
