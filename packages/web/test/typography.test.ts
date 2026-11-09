import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tokensCss = read("../src/styles/tokens.css");
const globalCss = read("../src/styles/global.css");
const clientCss = read("../src/styles/client.css");
const gamificationCss = read("../src/styles/gamification.css");
const componentsCss = read("../src/styles/components.css");
const loginCss = read("../src/pages/LoginPage.css");
const indexHtml = read("../index.html");

/**
 * Tipografia (DS2, decisão #135): títulos em DM Sans 700 com tracking negativo; Cormorant só como ênfase em itálico;
 * kicker em caixa alta espaçada; escala por tokens. Lê o CSS, sem navegador.
 */

/** Corpo da regra cujo seletor é exatamente `selector` (sem comentários). */
function ruleBody(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const chunk of clean.split("}")) {
    const open = chunk.indexOf("{");
    if (open !== -1 && chunk.slice(0, open).trim() === selector) return chunk.slice(open + 1);
  }
  throw new Error(`regra ${selector} não encontrada`);
}

/** Valor do token `--name` declarado em tokens.css (sem comentários), ou undefined. */
function token(name: string): string | undefined {
  const clean = tokensCss.replace(/\/\*[\s\S]*?\*\//g, "");
  return clean.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
}

describe("escala e tokens de tipografia", () => {
  it("define a escala, pesos, entrelinhas e tracking como tokens", () => {
    for (const name of [
      "text-display", "text-h1", "text-h2", "text-h3", "text-body", "text-small", "text-caption", "text-action",
      "weight-regular", "weight-medium", "weight-bold",
      "leading-display", "leading-title", "leading-body", "leading-small",
      "tracking-display", "tracking-title", "tracking-kicker",
    ]) {
      expect(token(name), name).toBeDefined();
    }
  });

  // Valores de docs/design/design-system.md (seção Tipografia) e da proposta (#tokens).
  it("corpo: 16px, altura 1,55, peso 400", () => {
    expect(token("text-body")).toBe("16px");
    expect(token("leading-body")).toBe("1.55");
    expect(token("weight-regular")).toBe("400");
  });

  it("pequeno: 13px, altura 1,45, peso 500", () => {
    expect(token("text-small")).toBe("13px");
    expect(token("leading-small")).toBe("1.45");
    expect(token("weight-medium")).toBe("500");
  });

  it("título de tela (H3 da proposta): 24px, altura 1,1, tracking -0,035em, peso 700", () => {
    expect(token("text-h1")).toBe("24px");
    expect(token("leading-title")).toBe("1.1");
    expect(token("tracking-title")).toBe("-0.035em");
    expect(token("weight-bold")).toBe("700");
  });

  it("display (herói): fluido de 34px a 72px, altura 1,04, tracking -0,045em", () => {
    expect(token("text-display")).toBe("clamp(34px, 6vw, 72px)");
    expect(token("leading-display")).toBe("1.04");
    expect(token("tracking-display")).toBe("-0.045em");
  });

  it("kicker: 11px (--text-kicker) com tracking 0,32em", () => {
    expect(token("text-kicker")).toBe("11px");
    expect(token("tracking-kicker")).toBe("0.32em");
  });

  it("ação (botão, 15px da proposta) fica abaixo do corpo", () => {
    expect(token("text-action")).toBe("15px");
  });

  it("a escala segue em ordem decrescente de tamanho fixo", () => {
    const px = ["text-h1", "text-h2", "text-h3", "text-body", "text-small", "text-caption", "text-kicker"].map((n) =>
      Number.parseFloat(token(n) ?? "NaN"),
    );
    expect(px.some(Number.isNaN)).toBe(false);
    // h3 (17) e corpo (16) são vizinhos; o resto é estritamente decrescente.
    for (let i = 1; i < px.length; i++) expect(px[i], `posição ${i}`).toBeLessThanOrEqual(px[i - 1]);
  });
});

describe("títulos das telas do cliente", () => {
  const titles: [string, string][] = [
    ["client.css", ruleBody(clientCss, ".fb-client-title")],
    ["gamification.css", ruleBody(gamificationCss, ".fb-gami__title")],
    ["LoginPage.css", ruleBody(loginCss, ".login-form__title")],
  ];

  for (const [sheet, body] of titles) {
    it(`${sheet}: título em DM Sans, sem Cormorant e com token de tamanho e tracking`, () => {
      expect(body).toContain("font-family: var(--font-sans)");
      expect(body).not.toContain("font-serif");
      expect(body).toMatch(/font-size:\s*var\(--text-h1\)/);
      expect(body).toMatch(/letter-spacing:\s*var\(--tracking-title\)/);
      expect(body).not.toMatch(/font-size:\s*\d/);
      expect(body).not.toMatch(/letter-spacing:\s*-?[\d.]+em/);
    });
  }
});

describe("classes compartilhadas", () => {
  it("kicker: 11px, peso 700, caixa alta e tracking 0,32em, tudo por token", () => {
    const body = ruleBody(globalCss, ".fb-kicker");
    expect(body).toContain("text-transform: uppercase");
    expect(body).toMatch(/letter-spacing:\s*var\(--tracking-kicker\)/);
    expect(body).toMatch(/font-size:\s*var\(--text-kicker\)/);
    expect(body).toMatch(/font-weight:\s*var\(--weight-bold\)/);
  });

  it("botão usa o tamanho de ação (15px da proposta), não o do corpo", () => {
    expect(ruleBody(componentsCss, ".fb-ui-btn")).toMatch(/font-size:\s*var\(--text-action\)/);
  });

  it("ênfase: Cormorant só em itálico", () => {
    const body = ruleBody(globalCss, ".fb-em");
    expect(body).toContain("font-family: var(--font-serif)");
    expect(body).toContain("font-style: italic");
  });
});

describe("carregamento das fontes", () => {
  it("usa display=swap e carrega Cormorant em itálico", () => {
    expect(indexHtml).toContain("display=swap");
    expect(indexHtml).toMatch(/Cormorant:ital,wght@[^"&]*1,700/);
  });
});
