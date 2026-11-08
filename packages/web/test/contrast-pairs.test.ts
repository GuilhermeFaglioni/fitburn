import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Verificação WCAG AA do tema escuro único (DS8, decisão 134): pares de texto/superfície, texto secundário,
 * link, erro, sucesso, aviso, borda de controle e texto do botão. Lê os tokens do disco.
 * Texto normal exige 4.5:1; texto grande e componentes de interface exigem 3:1.
 * Exceções são nomeadas, com o valor medido e a decisão que as aprovou.
 */
const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
const components = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");

type Rgb = [number, number, number];
const hex = (value: string): Rgb => {
  const h = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const luminance = ([r, g, b]: Rgb) => {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!m) throw new Error(`token ${name} não é hex`);
  return hex(m[1]);
};

const PAGE = token("color-surface-000");
const CARD = token("color-surface-raised");
const RAISED2 = token("color-surface-2");
const WHITE: Rgb = [255, 255, 255];

describe("texto normal (4.5:1) sobre o tema escuro", () => {
  const texts: [string, string][] = [
    ["ink-on-dark", "color-ink-on-dark"],
    ["ink-2-on-dark", "color-ink-2-on-dark"],
    ["text-muted-on-dark", "color-text-muted-on-dark"],
    ["brand-strong (link)", "color-brand-strong"],
    ["primary-orange como texto", "color-primary-orange"],
    ["danger (erro)", "color-danger"],
    ["success", "color-success"],
    ["warn", "color-warn"],
    ["info", "color-info"],
  ];
  for (const [label, name] of texts) {
    it(`${label} passa de 4.5:1 sobre a página, o cartão e a superfície 2`, () => {
      for (const [bgName, bg] of [["página", PAGE], ["cartão", CARD], ["superfície 2", RAISED2]] as const) {
        expect(contrast(token(name), bg), `${label} sobre ${bgName}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("exceção nomeada: texto faint (rótulo auxiliar)", () => {
  it("faint passa na página (4.80:1), mas no cartão dá 4.48:1, abaixo de 4.5 por 0.02: só no fundo da página", () => {
    expect(contrast(token("color-text-faint-on-dark"), PAGE)).toBeGreaterThanOrEqual(4.5);
    const onCard = contrast(token("color-text-faint-on-dark"), CARD);
    expect(onCard).toBeGreaterThan(4.4);
    expect(onCard).toBeLessThan(4.5);
  });
});

describe("borda de controle (3:1) e divisórias", () => {
  it("borda do campo e do botão secundário é o faint (4.48:1 sobre o cartão), não a linha decorativa", () => {
    expect(components).toMatch(/\.fb-field \{[^}]*border: 1px solid var\(--color-text-faint-on-dark\)/);
    expect(components).toMatch(/\.fb-btn-secondary \{[^}]*border: 1px solid var\(--color-text-faint-on-dark\)/);
    expect(contrast(token("color-text-faint-on-dark"), CARD)).toBeGreaterThanOrEqual(3);
  });

  it("a linha decorativa (line-2) fica abaixo de 3:1: é divisória, não borda de controle", () => {
    expect(contrast(token("color-line-2"), CARD)).toBeLessThan(3);
  });
});

describe("texto do botão primário (exceções aprovadas)", () => {
  it("branco sobre o laranja da marca dá 3.05:1: exceção aprovada na decisão 136 (texto grande e negrito)", () => {
    const ratio = contrast(WHITE, token("color-primary-orange"));
    expect(ratio).toBeCloseTo(3.05, 2);
    expect(ratio).toBeGreaterThanOrEqual(3);
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
