import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tokensCss = read("../src/styles/tokens.css");
const globalCss = read("../src/styles/global.css");
const clientCss = read("../src/styles/client.css");
const gamificationCss = read("../src/styles/gamification.css");
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

describe("escala e tokens de tipografia", () => {
  it("define a escala, pesos, entrelinhas e tracking como tokens", () => {
    for (const name of [
      "text-display", "text-h1", "text-h2", "text-h3", "text-body", "text-small", "text-caption",
      "weight-bold", "leading-title", "tracking-display", "tracking-title", "tracking-kicker",
    ]) {
      expect(tokensCss, name).toMatch(new RegExp(`--${name}:`));
    }
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
  it("kicker: caixa alta, espaçamento de rótulo e token de legenda", () => {
    const body = ruleBody(globalCss, ".fb-kicker");
    expect(body).toContain("text-transform: uppercase");
    expect(body).toMatch(/letter-spacing:\s*var\(--tracking-kicker\)/);
    expect(body).toMatch(/font-size:\s*var\(--text-caption\)/);
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
