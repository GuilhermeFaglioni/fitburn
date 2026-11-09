import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES, color, contrast, hex, type Rgb, type ThemeName } from "./theme-tokens";

/**
 * Verificação WCAG AA dos dois temas (DS8, decisões 134 e D-038): pares de texto/superfície, texto secundário,
 * link, erro, sucesso, aviso, borda de controle e texto do botão. Lê os tokens do disco e resolve cada tema.
 * Texto normal exige 4.5:1; texto grande e componentes de interface exigem 3:1.
 * Exceções são nomeadas, com o valor medido e a decisão que as aprovou.
 */
const components = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");

const WHITE: Rgb = [255, 255, 255];
const PAGE = (theme: ThemeName) => color(theme, "bg");
const CARD = (theme: ThemeName) => color(theme, "surface");
const SURFACE_2 = (theme: ThemeName) => color(theme, "surface-2");

describe.each(THEMES)("texto normal (4.5:1), tema %s", (theme) => {
  const texts: [string, string][] = [
    ["ink", "ink"],
    ["ink-2", "ink-2"],
    ["muted", "muted"],
    ["brand-strong (link)", "brand-strong"],
    ["danger (erro)", "danger"],
    ["success", "success"],
    ["warn", "warn"],
  ];
  for (const [label, name] of texts) {
    it(`${label} passa de 4.5:1 sobre a página, o cartão e a superfície 2`, () => {
      for (const [bgName, bg] of [
        ["página", PAGE(theme)],
        ["cartão", CARD(theme)],
        ["superfície 2", SURFACE_2(theme)],
      ] as const) {
        expect(contrast(color(theme, name), bg), `${label} sobre ${bgName}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("exceção nomeada: texto faint (rótulo auxiliar)", () => {
  it("escuro: faint passa na página (4.80:1), mas no cartão dá 4.48:1, abaixo de 4.5 por 0.02: só no fundo da página", () => {
    expect(contrast(color("dark", "faint"), PAGE("dark"))).toBeGreaterThanOrEqual(4.5);
    const onCard = contrast(color("dark", "faint"), CARD("dark"));
    expect(onCard).toBeGreaterThan(4.4);
    expect(onCard).toBeLessThan(4.5);
  });

  it("claro: faint dá 3.85:1 sobre branco (cinza das linhas inativas da proposta), acima de 3:1 e abaixo de 4.5:1", () => {
    const onPage = contrast(color("light", "faint"), PAGE("light"));
    expect(onPage).toBeGreaterThan(3.8);
    expect(onPage).toBeLessThan(4.5);
  });
});

describe("exceção nomeada: o laranja da marca como texto no tema claro", () => {
  it("claro: --brand dá 3.05:1 sobre branco, por isso o texto laranja do tema claro é --brand-strong (6.15:1)", () => {
    expect(contrast(color("light", "brand"), PAGE("light"))).toBeLessThan(4.5);
    expect(contrast(color("light", "brand-strong"), PAGE("light"))).toBeGreaterThanOrEqual(6);
  });

  it("escuro: --brand passa de 4.5:1 sobre a página e o cartão", () => {
    expect(contrast(color("dark", "brand"), PAGE("dark"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color("dark", "brand"), CARD("dark"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(THEMES)("borda de controle (3:1) e divisórias, tema %s", (theme) => {
  it("borda do campo e do botão secundário é o faint, não a linha decorativa", () => {
    expect(components).toMatch(/\.fb-ui-input \{[^}]*border: 1px solid var\(--faint\)/);
    expect(components).toMatch(/\.fb-ui-btn--secondary \{[^}]*border-color: var\(--faint\)/);
    expect(contrast(color(theme, "faint"), CARD(theme))).toBeGreaterThanOrEqual(3);
  });

  it("a linha decorativa (line-2) fica abaixo de 3:1: é divisória, não borda de controle", () => {
    expect(contrast(color(theme, "line-2"), CARD(theme))).toBeLessThan(3);
  });
});

describe("borda de controle (3:1): exceção nomeada do faint", () => {
  it("escuro: o faint dá 4.48:1 sobre o cartão (passa de 3:1)", () => {
    expect(contrast(color("dark", "faint"), CARD("dark"))).toBeGreaterThanOrEqual(3);
  });

  it("claro: o faint dá 3.85:1 sobre o cartão branco (passa de 3:1)", () => {
    expect(contrast(color("light", "faint"), CARD("light"))).toBeGreaterThanOrEqual(3);
  });
});

describe("texto do botão primário (exceções aprovadas)", () => {
  it("branco sobre o laranja da marca dá 3.05:1: exceção aprovada na decisão 136 (texto grande e negrito)", () => {
    for (const theme of THEMES) {
      const ratio = contrast(WHITE, color(theme, "brand"));
      expect(ratio).toBeCloseTo(3.05, 2);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it("branco sobre o fim do gradiente CTA (#C23A1F) passa de 4.5:1", () => {
    expect(contrast(WHITE, hex("#c23a1f"))).toBeGreaterThanOrEqual(4.5);
  });

  it("PENDENTE (DS1, decisão humana): o início do gradiente CTA (#F58A55) dá 2.43:1 com branco", () => {
    // Registrado, não corrigido: a decisão 136 aprovou o gradiente; o início fica abaixo de 3:1.
    expect(contrast(WHITE, hex("#f58a55"))).toBeCloseTo(2.43, 2);
  });
});

describe("tokens: nenhuma variável usada fica sem definição", () => {
  it("todo var(--nome) dos estilos e componentes tem um --nome declarado", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.(css|tsx|ts)$/.test(name) ? [path] : [];
      });
    const sources = walk(join(process.cwd(), "src")).map((p) => readFileSync(p, "utf8"));
    const declared = new Set(sources.flatMap((s) => [...s.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1])));
    const used = new Set(sources.flatMap((s) => [...s.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1])));
    expect([...used].filter((name) => !declared.has(name))).toEqual([]);
  });
});
