import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES, color, contrast } from "./theme-tokens";

/**
 * Detalhe da aula (folha, #156 PR 7): só tokens, sem ícone ou texto com cor literal, motion tokens e contraste da
 * nota informativa nos dois temas. Lê CSS e TSX do disco, sem navegador.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const agenda = strip(read("src/styles/agenda.css"));
const components = strip(read("src/styles/components.css"));
const sheetTsx = read("src/pages/client/ClassDetailSheet.tsx");
/** Só o código: o comentário cita a issue (#156). */
const sheetCode = sheetTsx.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|^\s*\/\/.*$/gm, "");

/** O trecho da folha em agenda.css: tudo a partir da primeira regra `.fb-sheet`/backdrop da folha. */
const sheetCss = agenda.slice(agenda.indexOf(".fb-ui-dialog-backdrop--sheet"));

function rule(css: string, selector: string): string {
  const out: string[] = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = sel.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (selectors.some((s) => s.replace(/^@media[^{]*\{\s*/, "") === selector)) out.push(body);
  }
  return out.join("\n");
}

describe("folha de detalhe da aula: só tokens", () => {
  it("a folha tem CSS próprio em agenda.css", () => {
    expect(sheetCss).toContain(".fb-sheet__kv");
    expect(sheetCss).toContain(".fb-sheet__spots");
    expect(sheetCss).toContain(".fb-sheet__note");
  });

  it("não tem cor literal nem raio ou fonte em px no CSS da folha", () => {
    expect(sheetCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(sheetCss.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(sheetCss.match(/border-radius:/g) ?? []).toEqual([]);
  });

  it("o TSX não tem cor literal: os ícones herdam currentColor", () => {
    expect(sheetCode.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(sheetCode.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(sheetTsx).not.toContain("FACT_STROKE");
    expect(sheetTsx).toContain("currentColor");
  });

  it("a folha é o Dialog compartilhado em variante sheet, com o CTA no rodapé fixo", () => {
    expect(sheetTsx).toContain('variant="sheet"');
    expect(sheetTsx).toContain("footer={action.footer}");
    expect(sheetTsx).not.toMatch(/fb-sheet-btn|fb-sheet-alert|fb-sheet-backdrop|useDialogFocus/);
  });

  it("a nota de disponibilidade usa --muted e o ícone de informação", () => {
    expect(rule(sheetCss, ".fb-sheet__note")).toMatch(/color:\s*var\(--muted\)/);
    expect(sheetTsx).toContain("InfoIcon");
  });

  it("os textos da folha e dos avisos ficam dentro do contraste AA nos dois temas", () => {
    for (const theme of THEMES) {
      const surface = color(theme, "surface");
      expect(
        contrast(color(theme, "muted"), surface),
        `${theme}: --muted sobre --surface`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(color(theme, "ink"), surface),
        `${theme}: --ink sobre --surface`,
      ).toBeGreaterThanOrEqual(4.5);
      for (const tone of ["danger", "success"]) {
        const bg = color(theme, `${tone}-bg`);
        expect(
          contrast(color(theme, tone, bg), bg),
          `${theme}: --${tone} sobre --${tone}-bg`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("folha (Dialog variant=sheet) e medidor em components.css", () => {
  it("a folha sobe da borda inferior no celular e usa o raio e a animação por token", () => {
    expect(rule(components, ".fb-ui-dialog-backdrop--sheet")).toMatch(/align-items:\s*flex-end/);
    const sheet = rule(components, ".fb-ui-dialog--sheet");
    expect(sheet).toMatch(/border-radius:\s*var\(--r-xl\) var\(--r-xl\) 0 0/);
    expect(sheet).toMatch(/animation:\s*fb-sheet-in 320ms var\(--ease-drawer\)/);
  });

  it("o corpo rola e o rodapé fica fixo, com o recuo da área segura", () => {
    expect(rule(components, ".fb-ui-dialog__body")).toMatch(/overflow-y:\s*auto/);
    const footer = rule(components, ".fb-ui-dialog__footer");
    expect(footer).toMatch(/flex:\s*0 0 auto/);
    expect(footer).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("o medidor revela com os motion tokens e usa o gradiente CTA", () => {
    const fill = rule(components, ".fb-ui-meter__fill");
    expect(fill).toMatch(/background:\s*var\(--grad-cta\)/);
    expect(fill).toMatch(/animation:\s*fb-meter-in var\(--duration-meter\)/);
    expect(rule(components, ".fb-ui-meter")).toMatch(/background:\s*var\(--surface-2\)/);
  });

  it("o aviso em linha usa os tokens de erro e de sucesso", () => {
    expect(rule(components, ".fb-ui-alert--err")).toMatch(
      /var\(--danger-bg\)[\s\S]*var\(--danger-line\)[\s\S]*var\(--danger\)/,
    );
    expect(rule(components, ".fb-ui-alert--ok")).toMatch(
      /var\(--success-bg\)[\s\S]*var\(--success-line\)[\s\S]*var\(--success\)/,
    );
  });
});
