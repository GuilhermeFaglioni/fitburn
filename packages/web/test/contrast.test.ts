import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import tokensCss from "../src/styles/tokens.css?raw";
import adminCss from "../src/styles/admin.css?raw";
import goalsCss from "../src/styles/goals.css?raw";
import dashboardCss from "../src/styles/dashboard.css?raw";
import clientCss from "../src/styles/client.css?raw";
import homeCss from "../src/styles/home.css?raw";
import planCss from "../src/styles/plan.css?raw";
import gamificationCss from "../src/styles/gamification.css?raw";
import attendanceCss from "../src/styles/attendance.css?raw";
import workoutCss from "../src/styles/workout.css?raw";

/**
 * Contraste WCAG (2.x) dos pares de cor do design system e das folhas de estilo.
 * Não há navegador na suíte, então o teste lê o CSS: garante que o texto não
 * volte a usar os cinzas que ficam abaixo de 4.5:1 (o #8a8a8a sobre branco,
 * o branco a 40-45% sobre o preto), o principal risco de regressão.
 */
type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function hex(value: string): Rgb {
  const h = value.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

function token(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token ${name} não encontrado`);
  return match[1].trim();
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = hex(token("color-surface-000"));
const RAISED: Rgb = hex(token("color-surface-raised"));

describe("contraste dos tokens de texto", () => {
  it("o laranja sobre o preto passa de 4.5:1 (o par que o design usa como texto)", () => {
    expect(contrast(hex(token("color-primary-orange")), BLACK)).toBeGreaterThanOrEqual(4.5);
  });

  it("o texto secundário das telas claras passa de 4.5:1 sobre branco e sobre o cinza #f0f0f0", () => {
    const muted = hex(token("color-text-muted-on-light"));
    expect(contrast(muted, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, hex("#f0f0f0"))).toBeGreaterThanOrEqual(4.5);
  });

  it("o texto laranja das telas claras passa de 4.5:1 sobre branco e sobre o fundo do destaque", () => {
    const accent = hex(token("color-accent-on-light"));
    const tint = over(hex(token("color-primary-orange")), 0.14, WHITE);
    expect(contrast(accent, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("o texto de erro das telas claras passa de 4.5:1 sobre o fundo do aviso", () => {
    const tint = over(hex("#c23a1f"), 0.08, WHITE);
    expect(contrast(hex(token("color-error-text-on-light")), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("o vermelho de erro das telas escuras passa de 4.5:1 sobre o fundo do aviso", () => {
    const tint = over(hex(token("color-danger")), 0.1, BLACK);
    expect(contrast(hex(token("color-danger")), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("o texto secundário das telas escuras (branco a 60%) passa de 4.5:1 sobre o cartão elevado", () => {
    const muted = token("color-text-muted-on-dark").match(/rgba\(255, 255, 255, ([\d.]+)\)/);
    expect(muted).not.toBeNull();
    const alpha = Number(muted?.[1]);
    expect(contrast(over(WHITE, alpha, RAISED), RAISED)).toBeGreaterThanOrEqual(4.5);
  });
});

/** Regras `seletor { ... color: valor; ... }` de uma folha de estilo. */
function textColors(css: string): { selector: string; value: string }[] {
  const found: { selector: string; value: string }[] = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const [, value] of body.matchAll(/(?<![-\w])color:\s*([^;]+);(?!\s*\/\* design)/g)) {
      found.push({ selector: selector.trim(), value: value.trim() });
    }
  }
  return found;
}

const LIGHT_SHEETS: [string, string][] = [
  ["admin.css", adminCss],
  ["goals.css", goalsCss],
  ["dashboard.css", dashboardCss],
];
const DARK_SHEETS: [string, string][] = [
  ["client.css", clientCss],
  ["home.css", homeCss],
  ["plan.css", planCss],
  ["gamification.css", gamificationCss],
  ["attendance.css", attendanceCss],
  ["workout.css", workoutCss],
];

describe("cores de texto das folhas de estilo", () => {
  it.each(LIGHT_SHEETS)("%s: texto em hexadecimal passa de 4.5:1 sobre branco", (_name, css) => {
    const colors = textColors(css);
    // Guarda contra o css vazio (o vitest só devolve o texto das folhas de src/styles, ver vite.config.ts).
    expect(colors.length).toBeGreaterThan(0);
    const failures = colors
      .filter(({ value }) => /^#[0-9a-f]{3,6}$/i.test(value))
      // Branco só aparece sobre fundo de marca (botão laranja/vermelho), nunca sobre branco.
      .filter(({ value }) => value.toLowerCase() !== "#ffffff")
      // Controles desabilitados são isentos.
      .filter(({ selector }) => !selector.includes(":disabled"))
      .filter(({ value }) => contrast(hex(value), WHITE) < 4.5)
      .map(({ selector, value }) => `${selector} → ${value}`);

    expect(failures).toEqual([]);
  });

  it.each(DARK_SHEETS)(
    "%s: texto branco translúcido passa de 4.5:1 sobre o cartão elevado",
    (_name, css) => {
      const colors = textColors(css);
      // Guarda contra o css vazio (o vitest só devolve o texto das folhas de src/styles, ver vite.config.ts).
      expect(colors.length).toBeGreaterThan(0);
      const failures = colors
        .map(({ selector, value }) => ({
          selector,
          value,
          alpha: value.match(/^rgba\(255,\s*255,\s*255,\s*([\d.]+)\)$/)?.[1],
        }))
        .filter((entry) => entry.alpha !== undefined)
        // Marco de progresso ainda não alcançado: elemento gráfico (mínimo de 3:1), não texto.
        .filter(({ selector }) => !selector.endsWith(".fb-gami__mark--pending"))
        .filter(({ alpha }) => contrast(over(WHITE, Number(alpha), RAISED), RAISED) < 4.5)
        .map(({ selector, value }) => `${selector} → ${value}`);

      expect(failures).toEqual([]);
    },
  );
});

/** Toda folha de estilo do app, lida do disco (as de páginas/componentes ficam fora de src/styles). */
function allSheets(): [string, string][] {
  const root = resolve(process.cwd(), "src");
  const sheets = readdirSync(resolve(root, "styles"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => `styles/${name}`)
    .concat(["pages/LoginPage.css", "components/AppMenu.css"]);
  return sheets.map((path) => [path, readFileSync(resolve(root, path), "utf8")]);
}

function resolveColor(value: string): Rgb {
  const variable = value.match(/^var\(--([\w-]+)\)$/);
  return hex(variable ? token(variable[1]) : value);
}

/** Regras cujo fundo é o laranja da marca, com o `color` declarado na própria regra. */
function orangeBackgrounds(css: string): { selector: string; color: string | undefined }[] {
  const found: { selector: string; color: string | undefined }[] = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/background(-color)?:[^;]*(primary-orange|#ed6e34)/i.test(body)) continue;
    // Cor literal do design (branco sobre o laranja, ~3:1): decisão registrada, fora da checagem.
    if (/(?<![-\w])color:[^;]+;\s*\/\* design/.test(body)) continue;
    found.push({
      selector: selector.trim().replace(/\s+/g, " "),
      color: body.match(/(?<![-\w])color:\s*([^;]+);/)?.[1].trim(),
    });
  }
  return found;
}

describe("botões primários (texto sobre o laranja da marca)", () => {
  const ORANGE = hex(token("color-primary-orange"));

  it("o texto sobre o laranja (token color-on-orange) passa de 4.5:1", () => {
    expect(contrast(resolveColor("var(--color-on-orange)"), ORANGE)).toBeGreaterThanOrEqual(4.5);
  });

  it("o branco sobre o laranja não passa de 4.5:1 (motivo do token)", () => {
    expect(contrast(WHITE, ORANGE)).toBeLessThan(4.5);
  });

  it.each(allSheets())("%s: todo fundo laranja usa texto com 4.5:1 ou mais", (_name, css) => {
    const failures = orangeBackgrounds(css)
      // O visto do checkbox marcado é um gráfico (mínimo de 3:1), não texto.
      .filter(({ selector }) => !selector.startsWith(".fb-checkbox:checked"))
      .filter(({ color }) => color === undefined || contrast(resolveColor(color), ORANGE) < 4.5)
      .map(({ selector, color }) => `${selector} → ${color ?? "sem color explícito"}`);

    expect(failures).toEqual([]);
  });

  it("o botão primário do painel e o dia da recorrência marcado usam o par testado", () => {
    const rules = orangeBackgrounds(adminCss);
    for (const selector of [".fb-btn-primary", '.fb-weekday-toggle[aria-pressed="true"]']) {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule, selector).toBeDefined();
      expect(contrast(resolveColor(rule?.color ?? "#ffffff"), ORANGE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o chip de dia marcado segue o design: branco (rótulo a 85%) sobre o laranja, trade-off de contraste registrado", () => {
    const rule = clientCss.match(
      /\.fb-daychip\[aria-pressed="true"\] \.fb-daychip__weekday\s*\{[^}]*color:\s*rgba\(255, 255, 255, 0\.85\);\s*\/\* design/,
    );
    expect(rule).not.toBeNull();
    // Cerca de 2,6:1 com o rótulo a 85%: só o número do dia (15px/700, branco pleno) fica perto de 3:1.
    expect(contrast(over(WHITE, 0.85, ORANGE), ORANGE)).toBeGreaterThanOrEqual(2.5);
  });

  it("o rótulo do botão de entrar do login usa o texto sobre o laranja", () => {
    const login = allSheets().find(([name]) => name === "pages/LoginPage.css")?.[1] ?? "";
    const label = textColors(login).find(
      ({ selector }) => selector === ".login-form__submit-label",
    );
    expect(label).toBeDefined();
    expect(contrast(resolveColor(label?.value ?? "#ffffff"), ORANGE)).toBeGreaterThanOrEqual(4.5);
  });
});
