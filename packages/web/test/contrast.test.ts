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
 * Não há navegador na suíte, então o teste lê o CSS.
 *
 * O design (Claude Design) vence: alguns pares que ele usa ficam abaixo de 4.5:1 e estão registrados aqui como
 * EXCEÇÕES CONHECIDAS DO DESIGN, cada uma com o valor de contraste medido. Todo o resto continua exigindo 4.5:1
 * (ou o mínimo da própria exceção), para o texto não deslizar para cinzas ainda mais claros:
 * - branco sobre o laranja da marca (botões, chips, abas): 3.05:1 (o preto daria 6.5:1); o design usa 700 e 13-15px;
 * - laranja da marca como texto/traço sobre branco: 3.05:1;
 * - #8a8a8a sobre branco: 3.45:1 (eyebrows, cabeçalhos de tabela, legendas); #b0b0b0 sobre branco: 2.17:1 (só linhas inativas);
 * - branco a 45% sobre o cartão elevado: 4.47:1; a 40%: 3.83:1 (datas, rótulos, rodapé); placeholder a 32%: 2.90:1.
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

  it("exceção do design: o texto secundário das telas claras (#8a8a8a) dá 3.45:1 sobre branco", () => {
    const muted = hex(token("color-text-muted-on-light"));
    expect(token("color-text-muted-on-light")).toBe("#8a8a8a");
    expect(contrast(muted, WHITE)).toBeCloseTo(3.45, 1);
  });

  it("exceção do design: o cinza das linhas inativas (#b0b0b0) dá 2.17:1 sobre branco e só serve para linhas esmaecidas", () => {
    expect(token("color-text-faint-on-light")).toBe("#b0b0b0");
    expect(contrast(hex(token("color-text-faint-on-light")), WHITE)).toBeCloseTo(2.17, 1);
  });

  it("exceção do design: o laranja da marca como texto das telas claras dá 3.05:1 sobre branco", () => {
    const accent = hex(token("color-accent-on-light"));
    expect(token("color-accent-on-light")).toBe(token("color-primary-orange"));
    expect(contrast(accent, WHITE)).toBeCloseTo(3.05, 1);
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

  it("níveis de texto translúcido do design: 50, 55 e 65% passam de 4.5:1; 40 e 45% são exceção do design (3.83:1 e 4.47:1)", () => {
    const alphaOf = (name: string) =>
      Number(token(name).match(/rgba\(255, 255, 255, ([\d.]+)\)/)?.[1]);
    const onRaised = (name: string) => contrast(over(WHITE, alphaOf(name), RAISED), RAISED);
    for (const name of ["color-on-dark-50", "color-on-dark-55", "color-on-dark-65"]) {
      expect(onRaised(name), name).toBeGreaterThanOrEqual(4.5);
    }
    expect(onRaised("color-on-dark-45")).toBeCloseTo(4.47, 1);
    expect(onRaised("color-on-dark-40")).toBeCloseTo(3.83, 1);
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

/**
 * Cores de texto que o design (Claude Design) manda usar nas telas claras, mesmo abaixo de 4.5:1 sobre branco:
 * cinza de rótulos e legendas (#8a8a8a), cinza de linha inativa (#b0b0b0), laranja de destaque (#ed6e34) e o
 * travessão da coluna de ações (#c8c8c8). O trade-off de contraste está registrado em
 * docs/design-fidelity-report.md (T3); a regra abaixo impede que outros cinzas claros entrem sem decisão.
 */
const DESIGN_LIGHT_TEXT = new Set(["#8a8a8a", "#b0b0b0", "#ed6e34", "#c8c8c8"]);

describe("cores de texto das folhas de estilo", () => {
  it.each(LIGHT_SHEETS)("%s: texto em hexadecimal passa de 4.5:1 sobre branco", (_name, css) => {
    const colors = textColors(css);
    // Guarda contra o css vazio (o vitest só devolve o texto das folhas de src/styles, ver vite.config.ts).
    expect(colors.length).toBeGreaterThan(0);
    const failures = colors
      .filter(({ value }) => /^#[0-9a-f]{3,6}$/i.test(value))
      // Branco só aparece sobre fundo de marca (botão laranja/vermelho), nunca sobre branco.
      .filter(({ value }) => value.toLowerCase() !== "#ffffff")
      // Cores mandadas pelo design (ver DESIGN_LIGHT_TEXT).
      .filter(({ value }) => !DESIGN_LIGHT_TEXT.has(value.toLowerCase()))
      // Controles desabilitados são isentos.
      .filter(({ selector }) => !selector.includes(":disabled"))
      .filter(({ value }) => contrast(hex(value), WHITE) < 4.5)
      .map(({ selector, value }) => `${selector} → ${value}`);

    expect(failures).toEqual([]);
  });

  it.each(DARK_SHEETS)(
    "%s: texto branco translúcido passa de 4.5:1 sobre o cartão elevado (exceto os níveis do design)",
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
        // Exceção do design: branco a 40% e 45% (datas, rótulos de campo, rodapé): 3.83:1 e 4.47:1. Abaixo disso não.
        .filter(({ alpha }) => !["0.4", "0.40", "0.45"].includes(alpha ?? ""))
        // O placeholder a 32% (2.90:1) também é do design; não é o texto digitado.
        .filter(({ selector }) => !selector.includes("::placeholder"))
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
    .concat(["pages/LoginPage.css", "pages/ClientCreatePage.css", "components/AppMenu.css"]);
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
  /** Exceção do design: branco em negrito sobre o laranja, 3.05:1 (o preto daria 6.5:1). Piso da exceção: 3:1. */
  const DESIGN_PAIR_MIN = 3;

  it("exceção do design: o texto sobre o laranja (token color-on-orange) é branco e dá 3.05:1", () => {
    expect(token("color-on-orange").toLowerCase()).toBe("#ffffff");
    const ratio = contrast(resolveColor("var(--color-on-orange)"), ORANGE);
    expect(ratio).toBeCloseTo(3.05, 1);
    expect(ratio).toBeGreaterThanOrEqual(DESIGN_PAIR_MIN);
  });

  it("o preto sobre o laranja passaria de 4.5:1 (o trade-off que o design decidiu não seguir)", () => {
    expect(contrast(BLACK, ORANGE)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(allSheets())("%s: todo fundo laranja usa o par do design (3:1 ou mais)", (_name, css) => {
    const failures = orangeBackgrounds(css)
      // O visto do checkbox marcado é um gráfico (mínimo de 3:1), não texto.
      .filter(({ selector }) => !selector.includes(".fb-checkbox"))
      .filter(
        ({ color }) =>
          color === undefined || contrast(resolveColor(color), ORANGE) < DESIGN_PAIR_MIN,
      )
      .map(({ selector, color }) => `${selector} → ${color ?? "sem color explícito"}`);

    expect(failures).toEqual([]);
  });

  it("o botão primário do painel e o dia da recorrência marcado usam o par do design", () => {
    const rules = orangeBackgrounds(adminCss);
    for (const selector of [".fb-btn-primary", '.fb-weekday-toggle[aria-pressed="true"]']) {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule, selector).toBeDefined();
      expect(contrast(resolveColor(rule?.color ?? "#ffffff"), ORANGE)).toBeGreaterThanOrEqual(
        DESIGN_PAIR_MIN,
      );
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
    expect(contrast(resolveColor(label?.value ?? "#ffffff"), ORANGE)).toBeGreaterThanOrEqual(
      DESIGN_PAIR_MIN,
    );
  });
});
