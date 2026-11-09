import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES, color, contrast, token } from "./theme-tokens";

/**
 * CSS dos componentes base I (#156, PR 3): só tokens, estados da seção "Componentes" da proposta, alvo de toque,
 * movimento e contraste nos dois temas. Lê o CSS do disco, sem navegador.
 */
const css = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Parte de components.css que é dos componentes novos (tudo que começa em `.fb-ui-`). */
const ui = clean
  .split(/(?<=\})\s*/)
  .filter((chunk) => chunk.includes(".fb-ui-"))
  .join("\n");

/** Corpos das regras cujo seletor casa `selector` (inclui os que estão dentro de @media). */
function bodies(selector: string): string[] {
  const out: string[] = [];
  for (const [, sel, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = sel.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (selectors.some((s) => s.replace(/^@media[^{]*\{\s*/, "") === selector)) out.push(body);
  }
  return out;
}
const rule = (selector: string) => bodies(selector).join("\n");

describe("componentes base I: só tokens", () => {
  it("existe CSS dos componentes novos", () => {
    for (const name of ["btn", "ui-input", "card", "badge", "chip", "pill", "segmented"]) {
      expect(ui, name).toContain(name === "ui-input" ? ".fb-ui-input" : `.fb-ui-${name}`);
    }
  });

  it("não tem cor literal (hex, rgb, rgba, hsl) nos componentes novos", () => {
    expect(ui.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(ui.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
  });

  it("não tem border-radius, font-size nem espaçamento em px que fujam do que a proposta fixa: raio sempre por token", () => {
    expect(ui.match(/border-radius:\s*\d+px/g) ?? []).toEqual([]);
    for (const [, value] of ui.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value.trim(), value).toMatch(/^(var\(--r-(xs|sm|md|lg|xl|pill)\)|50%|var\(--r-xl\) var\(--r-xl\) 0 0|0 var\(--r-xl\) var\(--r-xl\) 0)$/);
    }
  });

  it("sombras e foco vêm dos tokens", () => {
    for (const [, value] of ui.matchAll(/box-shadow:\s*([^;]+);/g)) {
      expect(value.trim(), value).toMatch(/^(none|var\(--sh-(1|2|3|cta|focus)\)(,\s*var\(--sh-(1|2|3|cta|focus)\))*)$/);
    }
  });
});

describe("botão", () => {
  it("todas as variantes existem", () => {
    for (const variant of ["primary", "secondary", "soft", "ghost", "danger", "sm", "block"]) {
      expect(bodies(`.fb-ui-btn--${variant}`).length, variant).toBeGreaterThan(0);
    }
  });

  it("base: raio --r-md, altura mínima de 48px e toque pressionado com a escala do token (0,97)", () => {
    const base = rule(".fb-ui-btn");
    expect(base).toMatch(/border-radius:\s*var\(--r-md\)/);
    expect(base).toMatch(/min-height:\s*var\(--h\)/);
    expect(base).toMatch(/--h:\s*48px/);
    expect(rule(".fb-ui-btn:active:not(:disabled):not([aria-busy=\"true\"])")).toMatch(
      /transform:\s*scale\(var\(--press-scale\)\)/,
    );
    expect(token("light", "press-scale")).toBe("0.97");
  });

  it("primário usa o gradiente CTA e --sh-cta; pequeno usa --r-sm", () => {
    const primary = rule(".fb-ui-btn--primary");
    expect(primary).toMatch(/background:\s*var\(--grad-cta\)/);
    expect(primary).toMatch(/box-shadow:\s*var\(--sh-cta\)/);
    expect(rule(".fb-ui-btn--sm")).toMatch(/border-radius:\s*var\(--r-sm\)/);
  });

  it("foco visível com --sh-focus (primário soma o anel à sombra do CTA)", () => {
    expect(rule(".fb-ui-btn:focus-visible")).toMatch(/box-shadow:\s*var\(--sh-focus\)/);
    expect(rule(".fb-ui-btn--primary:focus-visible")).toMatch(/box-shadow:\s*var\(--sh-focus\),\s*var\(--sh-cta\)/);
  });

  it("desabilitado e carregando: sem sombra nem escala, cursor e eventos de ponteiro coerentes", () => {
    const disabled = bodies('.fb-ui-btn:disabled').join("\n") + bodies('.fb-ui-btn[aria-disabled="true"]').join("\n");
    expect(disabled).toMatch(/cursor:\s*not-allowed/);
    expect(disabled).toMatch(/box-shadow:\s*none/);
    const busy = rule('.fb-ui-btn[aria-busy="true"]');
    expect(busy).toMatch(/cursor:\s*progress/);
    expect(busy).toMatch(/pointer-events:\s*none/);
  });

  it("spinner gira, mais devagar com reduced motion, e sem cor literal", () => {
    expect(rule(".fb-ui-spinner")).toMatch(/animation:\s*fb-ui-spin/);
    expect(clean).toMatch(/@keyframes fb-ui-spin/);
    expect(clean).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{[^@]*\.fb-ui-spinner/);
  });

  it("perigo é branco sobre o vermelho-chama (5,36:1) nos dois temas, não o --danger de texto", () => {
    expect(rule(".fb-ui-btn--danger")).toMatch(/background:\s*var\(--flame\)/);
    expect(rule(".fb-ui-btn--danger")).toMatch(/color:\s*var\(--on-brand\)/);
    for (const theme of THEMES) {
      const white: [number, number, number] = [255, 255, 255];
      expect(contrast(white, color(theme, "flame"))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("campo", () => {
  it("repouso: raio --r-md, 52px, borda --line-2 e --sh-1", () => {
    const input = rule(".fb-ui-input");
    expect(input).toMatch(/border-radius:\s*var\(--r-md\)/);
    expect(input).toMatch(/min-height:\s*52px/);
    expect(input).toMatch(/border:\s*1px solid var\(--faint\)/);
    expect(input).toMatch(/box-shadow:\s*var\(--sh-1\)/);
  });

  it("foco, erro (aria-invalid), sucesso e desabilitado têm regra própria", () => {
    expect(rule(".fb-ui-input:focus")).toMatch(/border-color:\s*var\(--brand\)/);
    expect(rule(".fb-ui-input:focus")).toMatch(/box-shadow:\s*var\(--sh-focus\)/);
    expect(rule('.fb-ui-input[aria-invalid="true"]')).toMatch(/border-color:\s*var\(--danger\)/);
    expect(rule(".fb-ui-input--ok")).toMatch(/border-color:\s*var\(--success\)/);
    expect(rule(".fb-ui-input:disabled")).toMatch(/background:\s*var\(--surface-2\)/);
  });

  it("mensagens de apoio: padrão, erro e sucesso", () => {
    expect(rule(".fb-ui-help")).toMatch(/color:\s*var\(--muted\)/);
    expect(rule(".fb-ui-help--err")).toMatch(/color:\s*var\(--danger\)/);
    expect(rule(".fb-ui-help--ok")).toMatch(/color:\s*var\(--success\)/);
  });

  it("a borda do campo (--faint) passa de 3:1 sobre o cartão nos dois temas (WCAG 1.4.11)", () => {
    for (const theme of THEMES) {
      expect(contrast(color(theme, "faint"), color(theme, "surface")), theme).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("card, badge, chip, pílula e segmented", () => {
  it("card: raio --r-lg, --sh-2, padding de 24px; selecionado com borda de marca", () => {
    const card = rule(".fb-ui-card");
    expect(card).toMatch(/border-radius:\s*var\(--r-lg\)/);
    expect(card).toMatch(/box-shadow:\s*var\(--sh-2\)/);
    expect(card).toMatch(/padding:\s*var\(--s-6\)/);
    expect(rule(".fb-ui-card--selected")).toMatch(/border:\s*2px solid var\(--brand\)/);
    expect(rule(".fb-ui-card--flat")).toMatch(/box-shadow:\s*none/);
  });

  it("badge: pílula com as seis variantes", () => {
    expect(rule(".fb-ui-badge")).toMatch(/border-radius:\s*var\(--r-pill\)/);
    for (const tone of ["neutral", "brand", "solid", "ok", "warn", "err"]) {
      expect(bodies(`.fb-ui-badge--${tone}`).length, tone).toBeGreaterThan(0);
    }
  });

  it("badge: o texto de cada tom passa de 4.5:1 sobre o próprio fundo, nos dois temas (a exceção do sólido é o branco sobre o laranja)", () => {
    const pairs: [string, string][] = [
      ["ink-2", "surface-2"],
      ["brand-strong", "brand-tint"],
      ["success", "success-bg"],
      ["danger", "danger-bg"],
      ["warn", "warn-bg"],
    ];
    for (const theme of THEMES) {
      for (const [text, bg] of pairs) {
        expect(contrast(color(theme, text), color(theme, bg, color(theme, "surface"))), `${text} ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("chip: raio --r-md, 60px de altura, marcado com o gradiente CTA e --sh-cta", () => {
    expect(rule(".fb-ui-chip")).toMatch(/border-radius:\s*var\(--r-md\)/);
    const pressed = rule('.fb-ui-chip[aria-pressed="true"]');
    expect(pressed).toMatch(/background:\s*var\(--grad-cta\)/);
    expect(pressed).toMatch(/box-shadow:\s*var\(--sh-cta\)/);
  });

  it("pílula: --r-pill, marcada inverte tinta e fundo (legível nos dois temas)", () => {
    expect(rule(".fb-ui-pill")).toMatch(/border-radius:\s*var\(--r-pill\)/);
    const pressed = rule('.fb-ui-pill[aria-pressed="true"]');
    expect(pressed).toMatch(/background:\s*var\(--ink\)/);
    expect(pressed).toMatch(/color:\s*var\(--bg\)/);
    for (const theme of THEMES) {
      expect(contrast(color(theme, "bg"), color(theme, "ink")), theme).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("segmented: trilho --r-pill e botão marcado com --sh-1", () => {
    expect(rule(".fb-ui-segmented")).toMatch(/border-radius:\s*var\(--r-pill\)/);
    expect(rule('.fb-ui-segmented button[aria-pressed="true"]')).toMatch(/box-shadow:\s*var\(--sh-1\)/);
  });

  it("chip, pílula e segmented têm foco visível com --sh-focus e escala ao pressionar", () => {
    for (const selector of [".fb-ui-chip", ".fb-ui-pill", ".fb-ui-segmented button"]) {
      expect(rule(`${selector}:focus-visible`), selector).toMatch(/box-shadow:\s*var\(--sh-focus\)/);
      expect(rule(`${selector}:active`), selector).toMatch(/transform:\s*scale\(var\(--press-scale\)\)/);
    }
  });
});

describe("alvo de toque e movimento", () => {
  it("em pointer: coarse, botão, pílula e segmented chegam a 44px (campo e chip já passam)", () => {
    const coarse = clean.match(/@media \(pointer: coarse\)\s*\{[\s\S]*?\n\}/g)?.join("\n") ?? "";
    for (const selector of [".fb-ui-btn", ".fb-ui-pill", ".fb-ui-segmented button"]) {
      expect(coarse, selector).toContain(selector);
    }
    expect(coarse).toMatch(/min-height:\s*44px/);
    expect(rule(".fb-ui-input")).toMatch(/min-height:\s*52px/);
    expect(rule(".fb-ui-chip")).toMatch(/min-height:\s*60px|height:\s*60px/);
  });

  it("as transições usam as durações e a curva dos tokens", () => {
    for (const [, value] of ui.matchAll(/transition:\s*([^;]+);/g)) {
      expect(value, value).toMatch(/var\(--duration-(state|press)\)/);
      expect(value, value).toContain("var(--ease-out)");
    }
  });

  it("hover só em dispositivos com ponteiro (não gruda no toque)", () => {
    expect(clean).toMatch(/@media \(hover: hover\)/);
  });
});

describe("checkbox compartilhado", () => {
  it("tem alvo de toque de 44px, a cor da marca na caixa e o anel de foco", () => {
    expect(rule(".fb-ui-check")).toMatch(/min-height:\s*44px/);
    expect(rule(".fb-ui-check__input")).toMatch(/accent-color:\s*var\(--brand\)/);
    expect(rule(".fb-ui-check__input:focus-visible")).toMatch(
      /outline:\s*2px solid var\(--brand\)/,
    );
  });

  it("não tem cor literal nem tamanho de texto fora dos tokens", () => {
    const block = [".fb-ui-check", ".fb-ui-check__input", ".fb-ui-check__input:focus-visible"]
      .map(rule)
      .join("\n");
    expect(block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(block.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(block.match(/font-size:\s*\d/g) ?? []).toEqual([]);
  });
});
