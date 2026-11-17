import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fotos do produto (L3, #191): a seção usa os componentes da base e só tokens (sem cor, raio, espaçamento ou fonte
 * literal, e sem estilo inline). Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("seção Fotos do produto: nada literal no TSX", () => {
  const source = code(read("src/pages/shop/ProductPhotos.tsx"));

  it("não tem cor literal nem estilo inline", () => {
    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source).not.toMatch(/\bstyle=\{/);
  });

  it("reaproveita os componentes da base, a confirmação da Loja e os avisos de conexão", () => {
    for (const component of ["ui/ActionMenu", "ui/Alert", "ui/Badge", "ui/Card", "ui/States"]) {
      expect(source).toContain(`components/${component}`);
    }
    expect(source).toContain("ConfirmDeleteDialog");
    expect(source).toContain("ShopAction");
    expect(source).toContain("useNetworkRequired");
  });
});

describe("CSS da seção Fotos do produto: só tokens", () => {
  const raw = read("src/styles/admin.css");
  const start = raw.indexOf("Loja (#191): fotos do produto");
  const end = raw.indexOf("Bioimpedância (B2)");
  const section = code(raw.slice(raw.indexOf("*/", start) + 2, end));

  it("a seção existe e traz a grade, a foto e o espaço de adicionar", () => {
    expect(start).toBeGreaterThan(-1);
    for (const selector of [".fb-shop-photos", ".fb-shop-photo__frame", ".fb-shop-photo__add"]) {
      expect(section).toContain(selector);
    }
  });

  it("sem cor literal, sem fonte em px, sem espaçamento nem raio literais", () => {
    expect(section.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(section.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(section.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
    for (const [, value] of section.matchAll(/(?:padding|margin|gap)[a-z-]*:\s*([^;]+);/g)) {
      expect(value).not.toMatch(/\b[1-9]\d*px\b/);
    }
    for (const [, value] of section.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value).toMatch(/^var\(--r-/);
    }
  });
});
