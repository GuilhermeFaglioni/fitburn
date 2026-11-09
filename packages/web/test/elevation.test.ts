import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { THEMES, token } from "./theme-tokens";

/**
 * Raio, sombras e bordas (DS3, decisões #133 e #134; sombras nos dois temas, D-038). Lê o CSS, sem navegador.
 * O raio fica em 5px: nenhum `border-radius` literal novo fora de tokens.css.
 */
// Vitest roda a partir de packages/web (pnpm --filter).
const SRC = join(process.cwd(), "src");

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") && name !== "tokens.css" ? [path] : [];
  });
}

const files = cssFiles(SRC).map((path) => ({ path, css: readFileSync(path, "utf8") }));
const tokens = readFileSync(join(SRC, "styles/tokens.css"), "utf8");
const global = readFileSync(join(SRC, "styles/global.css"), "utf8");

describe("elevação e foco", () => {
  it("define os níveis de sombra da proposta e o anel de foco de 3px, nos dois temas", () => {
    for (const theme of THEMES) {
      for (const name of ["sh-1", "sh-2", "sh-3", "sh-cta", "sh-focus"]) {
        expect(token(theme, name), `${name} ${theme}`).toMatch(/^0 /);
      }
      expect(token(theme, "sh-focus"), theme).toMatch(/^0 0 0 3px /);
    }
  });

  it("as sombras mudam com o tema: tingidas de marrom no claro, pretas no escuro (a do CTA fica laranja)", () => {
    for (const name of ["sh-1", "sh-2", "sh-3"]) {
      expect(token("light", name), name).toContain("rgba(120,52,20,");
      expect(token("dark", name), name).toContain("rgba(0,0,0,");
    }
    expect(token("light", "sh-cta")).toContain("rgba(237,110,52,");
    expect(token("dark", "sh-cta")).toContain("rgba(237,110,52,");
    expect(token("light", "sh-cta")).not.toBe(token("dark", "sh-cta"));
  });

  it("nenhum nome antigo de sombra sobrevive", () => {
    for (const { path, css } of files) {
      expect(css, path).not.toMatch(/--shadow-(popover|dialog|sheet|cta)/);
    }
    expect(tokens).not.toMatch(/--shadow-/);
  });

  it("o foco visível usa o token de anel e mantém :focus-visible", () => {
    expect(global).toMatch(/:focus-visible\s*\{[^}]*box-shadow:\s*var\(--sh-focus\)/);
  });
});

describe("raio e bordas", () => {
  it("nenhum border-radius em px literal fora de tokens.css (o raio da marca é --radius-sm)", () => {
    const offenders = files.filter(({ css }) => /border-radius:\s*\d+px/.test(css)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("bordas de 1px de cartões e divisórias usam as linhas do tema (--line), não branco translúcido", () => {
    const literal = files.flatMap(({ path, css }) =>
      [...css.matchAll(/border[^;\n]*1px solid rgba\(255,\s*255,\s*255,\s*0\.(06|08)\)/g)].map(() => path),
    );
    expect(literal).toEqual([]);
  });
});
