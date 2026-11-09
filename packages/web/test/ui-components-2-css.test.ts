import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES, color, contrast } from "./theme-tokens";

/**
 * CSS dos componentes base II (#156, PR 4): tabela, acordeão, diálogo, estados e barra inferior. Só tokens, prefixo
 * `fb-ui-`, alvo de toque, movimento e contraste nos dois temas. Lê o CSS do disco, sem navegador.
 */
const css = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

const NEW_BLOCKS = ["table", "accordion", "dialog", "state", "bottom-nav"];

/** Regras (com @media achatadas) cujo seletor menciona um dos blocos novos. */
const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  selectors: sel.split(",").map((s) => s.replace(/^[\s\S]*?@media[^{]*\{/, "").replace(/\s+/g, " ").trim()),
  body,
}));
const isNew = (selector: string) => NEW_BLOCKS.some((b) => new RegExp(`\\.fb-ui-${b}(?![\\w-]*[a-z])|\\.fb-ui-${b}[_-]`).test(selector));
const ui = rules.filter((r) => r.selectors.some(isNew));
const uiCss = ui.map((r) => r.body).join("\n");
const rule = (selector: string) => rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body).join("\n");

describe("componentes base II: prefixo e só tokens", () => {
  it("existe CSS de cada componente, todo com o prefixo fb-ui-", () => {
    for (const selector of [
      ".fb-ui-table-wrap",
      ".fb-ui-table",
      ".fb-ui-accordion",
      ".fb-ui-dialog-backdrop",
      ".fb-ui-dialog",
      ".fb-ui-state",
      ".fb-ui-bottom-nav",
    ]) {
      expect(rule(selector), selector).not.toBe("");
    }
  });

  it("não tem cor literal (hex, rgb, rgba, hsl)", () => {
    expect(uiCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(uiCss.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
  });

  it("raio, sombra e tamanho de texto vêm dos tokens", () => {
    for (const [, value] of uiCss.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value.trim(), value).toMatch(/^(var\(--r-(xs|sm|md|lg|xl|pill)\)|50%|var\(--r-(lg|xl)\) var\(--r-(lg|xl)\) 0 0|0 var\(--r-xl\) var\(--r-xl\) 0)$/);
    }
    for (const [, value] of uiCss.matchAll(/box-shadow:\s*([^;]+);/g)) {
      expect(value.trim(), value).toMatch(/^(none|var\(--sh-(1|2|3|cta|focus)\)(,\s*var\(--sh-(1|2|3|cta|focus)\))*)$/);
    }
    expect(uiCss.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
  });

  it("cor de texto e de fundo usam tokens da base (nada de --color-* legado)", () => {
    expect(uiCss).not.toMatch(/--color-/);
  });

  it("as transições usam as durações e a curva dos tokens", () => {
    for (const [, value] of uiCss.matchAll(/transition:\s*([^;]+);/g)) {
      expect(value, value).toMatch(/var\(--duration-(state|press)\)/);
      expect(value, value).toContain("var(--ease-out)");
    }
  });

  it("o movimento do acordeão e do spinner reduz com reduced motion", () => {
    const reduced = clean.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g)?.join("\n") ?? "";
    expect(reduced).toContain(".fb-ui-state__spinner");
    expect(reduced).toContain(".fb-ui-accordion__icon");
  });
});

describe("tabela", () => {
  it("a rolagem horizontal fica no contêiner: overflow-x auto, sem estourar a página", () => {
    const wrap = rule(".fb-ui-table-wrap");
    expect(wrap).toMatch(/overflow-x:\s*auto/);
    expect(wrap).toMatch(/max-width:\s*100%/);
    expect(wrap).toMatch(/border-radius:\s*var\(--r-lg\)/);
    expect(wrap).toMatch(/background:\s*var\(--surface\)/);
    expect(rule(".fb-ui-table-wrap:focus-visible")).toMatch(/box-shadow:\s*var\(--sh-focus\)/);
  });

  it("a tabela tem largura mínima para rolar dentro do contêiner, e o cabeçalho usa fundo e borda de token", () => {
    expect(rule(".fb-ui-table")).toMatch(/min-width:\s*520px/);
    const th = rule(".fb-ui-table th");
    expect(th).toMatch(/background:\s*var\(--surface-2\)/);
    expect(th).toMatch(/border-bottom:\s*1px solid var\(--line\)/);
    expect(th).toMatch(/text-transform:\s*uppercase/);
  });

  it("linha com hover (só em ponteiro) e coluna de ações à direita, sem quebra", () => {
    expect(clean).toMatch(/@media \(hover: hover\)\s*\{[^@]*\.fb-ui-table tbody tr:hover td\s*\{[^}]*background:\s*var\(--bg-soft\)/);
    const actions = rule(".fb-ui-table__actions");
    expect(actions).toMatch(/text-align:\s*right/);
    expect(actions).toMatch(/white-space:\s*nowrap/);
  });

  it("o texto do cabeçalho (--muted) passa de 4.5:1 sobre --surface-2 e o da célula sobre --surface, nos dois temas", () => {
    for (const theme of THEMES) {
      expect(contrast(color(theme, "muted"), color(theme, "surface-2")), theme).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color(theme, "ink-2"), color(theme, "surface")), theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("acordeão", () => {
  it("título com foco visível, sem o marcador nativo, e indicador circular com a marca", () => {
    expect(rule(".fb-ui-accordion__item summary")).toMatch(/list-style:\s*none/);
    expect(clean).toMatch(/\.fb-ui-accordion__item summary::-webkit-details-marker\s*\{[^}]*display:\s*none/);
    expect(rule(".fb-ui-accordion__item summary:focus-visible")).toMatch(/box-shadow:\s*var\(--sh-focus\)/);
    expect(rule(".fb-ui-accordion__icon")).toMatch(/border-radius:\s*50%/);
    expect(rule(".fb-ui-accordion__icon::before")).toMatch(/background:\s*var\(--brand\)/);
  });

  it("aberto: indicador preenchido de marca (traços em --on-brand) e gira", () => {
    const open = rule(".fb-ui-accordion__item[open] .fb-ui-accordion__icon");
    expect(open).toMatch(/background:\s*var\(--brand\)/);
    expect(open).toMatch(/transform:\s*rotate\(180deg\)/);
    expect(rule(".fb-ui-accordion__item[open] .fb-ui-accordion__icon::before")).toMatch(/background:\s*var\(--on-brand\)/);
  });

  it("o texto do painel (--muted) passa de 4.5:1 sobre o fundo nos dois temas", () => {
    expect(rule(".fb-ui-accordion__panel")).toMatch(/color:\s*var\(--muted\)/);
    for (const theme of THEMES) {
      expect(contrast(color(theme, "muted"), color(theme, "bg")), theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("diálogo", () => {
  it("fundo escurecido por token, fixo na tela inteira", () => {
    const backdrop = rule(".fb-ui-dialog-backdrop");
    expect(backdrop).toMatch(/position:\s*fixed/);
    expect(backdrop).toMatch(/inset:\s*0/);
    expect(backdrop).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--ink\)\s*\d+%,\s*transparent\)/);
  });

  it("cartão com --r-xl, --sh-3, superfície e padding de token; cabe no celular", () => {
    const dialog = rule(".fb-ui-dialog");
    expect(dialog).toMatch(/border-radius:\s*var\(--r-xl\)/);
    expect(dialog).toMatch(/box-shadow:\s*var\(--sh-3\)/);
    expect(dialog).toMatch(/background:\s*var\(--surface\)/);
    expect(dialog).toMatch(/padding:\s*var\(--s-7\)/);
    expect(dialog).toMatch(/max-width:\s*min\(/);
    expect(dialog).toMatch(/max-height:\s*100%/);
    expect(dialog).toMatch(/overflow(-y)?:\s*auto/);
  });

  it("o foco no próprio cartão não desenha contorno extra, e o rodapé alinha as ações à direita", () => {
    expect(rule(".fb-ui-dialog:focus-visible")).toMatch(/outline:\s*none/);
    expect(rule(".fb-ui-dialog__actions")).toMatch(/justify-content:\s*flex-end/);
  });
});

describe("diálogo em variante drawer (gaveta)", () => {
  it("o fundo alinha o painel à esquerda, sem respiro, e o painel ocupa a altura toda sem passar de 85% da largura", () => {
    const backdrop = rule(".fb-ui-dialog-backdrop--drawer");
    expect(backdrop).toMatch(/justify-content:\s*flex-start/);
    expect(backdrop).toMatch(/align-items:\s*stretch/);
    expect(backdrop).toMatch(/padding:\s*0/);
    const drawer = rule(".fb-ui-dialog--drawer");
    expect(drawer).toMatch(/height:\s*100%/);
    expect(drawer).toMatch(/max-width:\s*85vw/);
    expect(drawer).toMatch(/border-radius:\s*0 var\(--r-xl\) var\(--r-xl\) 0/);
  });

  it("entra deslizando da esquerda pela curva da gaveta, e o movimento some com reduced motion (--sheet-offset)", () => {
    expect(rule(".fb-ui-dialog--drawer")).toMatch(/animation:\s*fb-drawer-in \d+ms var\(--ease-drawer\)/);
    const global = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
    expect(global).toMatch(/@keyframes fb-drawer-in\s*\{\s*from\s*\{\s*transform:\s*translateX\(calc\(var\(--sheet-offset\) \* -1\)\)/);
  });

  it("compartilha com a folha o miolo sem padding (barra superior, corpo que rola, rodapé fixo)", () => {
    const sheet = clean.match(/\.fb-ui-dialog--sheet,\s*\.fb-ui-dialog--drawer\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(sheet).toMatch(/padding:\s*0/);
    expect(sheet).toMatch(/overflow:\s*hidden/);
  });
});

describe("estados", () => {
  it("vazio: faixa tracejada; erro: tom de erro; offline: borda tracejada e ícone (não só cor)", () => {
    expect(rule(".fb-ui-state--empty")).toMatch(/border:\s*1px dashed var\(--line-2\)/);
    const err = rule(".fb-ui-state--error");
    expect(err).toMatch(/background:\s*var\(--danger-bg\)/);
    expect(err).toMatch(/border:\s*1px solid var\(--danger-line\)/);
    expect(err).toMatch(/color:\s*var\(--danger\)/);
    const offline = rule(".fb-ui-state--offline");
    expect(offline).toMatch(/background:\s*var\(--surface-2\)/);
    expect(offline).toMatch(/border:\s*1px dashed var\(--faint\)/);
    expect(rule(".fb-ui-state__icon")).toMatch(/width:\s*\d+px/);
  });

  it("carregando: spinner gira e acompanha a cor do texto", () => {
    const spinner = rule(".fb-ui-state__spinner");
    expect(spinner).toMatch(/animation:\s*fb-ui-spin/);
    expect(spinner).toMatch(/border-top-color:\s*currentColor/);
  });

  it("o texto de cada estado passa de 4.5:1 sobre o próprio fundo, nos dois temas", () => {
    const pairs: [string, string][] = [
      ["danger", "danger-bg"],
      ["ink-2", "surface-2"],
      ["muted", "surface-2"],
      ["muted", "bg"],
    ];
    for (const theme of THEMES) {
      for (const [text, bg] of pairs) {
        expect(contrast(color(theme, text), color(theme, bg, color(theme, "surface"))), `${text}/${bg} ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("barra inferior", () => {
  it("é uma grade sobre a superfície, com borda de cima, e respeita a área segura do aparelho", () => {
    const nav = rule(".fb-ui-bottom-nav");
    expect(nav).toMatch(/display:\s*grid/);
    expect(nav).toMatch(/background:\s*var\(--surface\)/);
    expect(nav).toMatch(/border-top:\s*1px solid var\(--line\)/);
    expect(nav).toMatch(/env\(safe-area-inset-bottom/);
  });

  it("alvo de toque de 44px nos itens, com foco visível e escala ao pressionar", () => {
    const item = rule(".fb-ui-bottom-nav__item");
    expect(item).toMatch(/min-height:\s*44px/);
    expect(rule(".fb-ui-bottom-nav__item:focus-visible")).toMatch(/box-shadow:\s*var\(--sh-focus\)/);
    expect(rule(".fb-ui-bottom-nav__item:active")).toMatch(/transform:\s*scale\(var\(--press-scale\)\)/);
  });

  it("item atual em --brand-strong com ícone em --brand; os outros em --muted", () => {
    expect(rule(".fb-ui-bottom-nav__item")).toMatch(/color:\s*var\(--muted\)/);
    expect(rule('.fb-ui-bottom-nav__item[aria-current="page"]')).toMatch(/color:\s*var\(--brand-strong\)/);
    expect(rule('.fb-ui-bottom-nav__item[aria-current="page"] .fb-ui-bottom-nav__icon svg')).toMatch(/stroke:\s*var\(--brand\)/);
  });

  it("o item atual não depende só de cor: o rótulo ganha peso", () => {
    expect(rule('.fb-ui-bottom-nav__item[aria-current="page"]')).toMatch(/font-weight:\s*var\(--weight-bold\)/);
  });

  it("os rótulos passam de 4.5:1 sobre a superfície nos dois temas (inativo e atual)", () => {
    for (const theme of THEMES) {
      expect(contrast(color(theme, "muted"), color(theme, "surface")), theme).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color(theme, "brand-strong"), color(theme, "surface")), theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});
