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

/**
 * POLÍTICA DE CONTRASTE DAS FOLHAS DE ESTILO
 *
 * Toda declaração `color` é checada; o comentário `/* design *\/` NÃO isenta nada. Só valem as exceções NOMEADAS
 * abaixo, cada uma com o piso mínimo da razão de contraste medida. Qualquer outro valor exige 4.5:1.
 * (`color: rgba(255,255,255,0.2); /* design *\/` falha, por exemplo.)
 */

/** Piso do par "branco sobre o laranja da marca" (3.05:1 medido). */
const WHITE_ON_ORANGE_FLOOR = 3;

/** Cores de texto das telas claras que o design manda usar, com o piso da razão sobre branco. */
const LIGHT_TEXT_EXCEPTIONS: Record<string, { floor: number; why: string }> = {
  "#8a8a8a": { floor: 3.4, why: "cinza de rótulos e legendas (3.45:1)" },
  "#b0b0b0": { floor: 2.1, why: "cinza de linha inativa (2.17:1)" },
  "#ed6e34": { floor: 3, why: "laranja de destaque como texto (3.05:1)" },
  "#c8c8c8": { floor: 1.6, why: "travessão da coluna de ações (1.67:1, decorativo)" },
};

/**
 * Seletores EXATOS de telas claras cuja cor de texto é branco sem fundo na própria regra:
 * - "orange": o fundo laranja vem de outra regra (o visto do checkbox, gráfico; o botão primário do formulário
 *   de metas, que herda o fundo de .fb-btn-primary): vale o piso de 3:1 do par do design;
 * - "no-text": barras de progresso, sem texto (o `color` só existe para o guarda de fundos laranja).
 */
const LIGHT_WHITE_NO_BACKGROUND = new Map<string, "orange" | "no-text">([
  [".fb-checkbox:checked::after", "orange"],
  [".fb-checkbox.fb-checkbox--fixed:disabled:checked::after", "orange"],
  [".fb-goals__form .fb-btn-primary", "orange"],
  [".fb-goals__bar-fill", "no-text"],
  [".fb-dash__meter-fill", "no-text"],
]);

/**
 * Regras laranja do checkbox (o fundo está na regra; o visto `::after` está em LIGHT_WHITE_NO_BACKGROUND):
 * só estes seletores exatos ficam sem `color` explícito.
 */
const ORANGE_CHECKBOX_SELECTORS = new Set([
  ".fb-checkbox:checked",
  ".fb-checkbox.fb-checkbox--fixed:disabled:checked",
]);

/** Níveis de branco translúcido do design nas telas escuras, com o piso da razão sobre o cartão elevado. */
const DARK_ALPHA_EXCEPTIONS: Record<string, { floor: number; only?: string; why: string }> = {
  "0.32": { floor: 2.85, only: "::placeholder", why: "placeholder (2.90:1), não é o texto digitado" },
  "0.4": { floor: 3.8, why: "datas, rótulos, rodapé (3.83:1)" },
  "0.45": { floor: 4.4, why: "datas, rótulos de campo (4.47:1)" },
  "0.5": { floor: 4.5, why: "subtítulos (passa de 4.5:1)" },
  "0.55": { floor: 4.5, why: "legendas (passa de 4.5:1)" },
};

/** Pares nomeados (seletor exato, cor de texto) sobre fundo que não é o cartão elevado. */
const DARK_NAMED_PAIRS: { selector: string; value: string; floor: number; bg: Rgb; why: string }[] = [
  {
    selector: '.fb-daychip[aria-pressed="true"] .fb-daychip__weekday',
    value: "rgba(255, 255, 255, 0.85)",
    floor: 2.5,
    bg: hex(token("color-primary-orange")),
    why: "rótulo a 85% do chip de dia marcado, sobre o laranja (~2.6:1)",
  },
  {
    selector: ".fb-gami__mark--pending",
    value: "rgba(255, 255, 255, 0.4)",
    floor: 3,
    bg: RAISED,
    why: "marco ainda não alcançado: elemento gráfico (3:1), não texto",
  },
];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

/** Regras `seletor { ... color: valor; ... }` de uma folha de estilo (todas, sem escape por comentário). */
function textColors(css: string): { selector: string; value: string; body: string }[] {
  const found: { selector: string; value: string; body: string }[] = [];
  for (const [, selector, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const [, value] of body.matchAll(/(?<![-\w])color:\s*([^;]+);/g)) {
      found.push({ selector: normalize(selector), value: value.trim(), body });
    }
  }
  return found;
}

function backgroundOf(body: string): Rgb | undefined {
  const value = body.match(/(?<![-\w])background(?:-color)?:\s*([^;]+);/)?.[1].trim();
  if (!value) return undefined;
  const variable = value.match(/^var\(--([\w-]+)\)$/);
  const color = variable ? token(variable[1]) : value;
  return /^#[0-9a-f]{3,6}$/i.test(color) ? hex(color) : undefined;
}

const ORANGE_RGB = hex(token("color-primary-orange"));

/** Falhas de contraste de uma folha de estilo de telas CLARAS (texto sobre branco). */
function lightFailures(css: string): string[] {
  return (
    textColors(css)
      .filter(({ value }) => /^#[0-9a-f]{3,6}$/i.test(value))
      // Controles desabilitados são isentos pela própria WCAG (1.4.3).
      .filter(({ selector }) => !selector.includes(":disabled") || LIGHT_WHITE_NO_BACKGROUND.has(selector))
      .filter(({ selector, value, body }) => {
        const color = value.toLowerCase();
        if (color === "#ffffff" || color === "#fff") {
          const named = LIGHT_WHITE_NO_BACKGROUND.get(selector);
          if (named) return named === "orange" && contrast(WHITE, ORANGE_RGB) < WHITE_ON_ORANGE_FLOOR;
          const bg = backgroundOf(body);
          if (!bg) return true; // branco sem fundo conhecido na regra: não nomeado
          const isOrange = contrast(bg, ORANGE_RGB) < 1.05;
          return contrast(WHITE, bg) < (isOrange ? WHITE_ON_ORANGE_FLOOR : 4.5);
        }
        const exception = LIGHT_TEXT_EXCEPTIONS[color];
        return contrast(hex(value), WHITE) < (exception ? exception.floor : 4.5);
      })
      .map(({ selector, value }) => `${selector} → ${value}`)
  );
}

/** Falhas de contraste de uma folha de estilo de telas ESCURAS (branco translúcido sobre o cartão elevado). */
function darkFailures(css: string): string[] {
  const failures: string[] = [];
  for (const { selector, value } of textColors(css)) {
    const alpha = value.match(/^rgba\(255,\s*255,\s*255,\s*([\d.]+)\)$/)?.[1];
    if (alpha === undefined) continue;
    const pair = DARK_NAMED_PAIRS.find(
      (p) => p.selector === selector && p.value === value.replace(/,\s*/g, ", "),
    );
    let floor = 4.5;
    let bg = RAISED;
    if (pair) {
      floor = pair.floor;
      bg = pair.bg;
    } else {
      const named = DARK_ALPHA_EXCEPTIONS[String(Number(alpha))];
      if (named && (!named.only || selector.includes(named.only))) floor = named.floor;
    }
    if (contrast(over(WHITE, Number(alpha), bg), bg) < floor) failures.push(`${selector} → ${value}`);
  }
  return failures;
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
  it.each(LIGHT_SHEETS)("%s: texto passa de 4.5:1 sobre branco (exceto as cores nomeadas do design)", (_name, css) => {
    // Guarda contra o css vazio (o vitest só devolve o texto das folhas de src/styles, ver vite.config.ts).
    expect(textColors(css).length).toBeGreaterThan(0);
    expect(lightFailures(css)).toEqual([]);
  });

  it.each(DARK_SHEETS)(
    "%s: texto branco translúcido passa de 4.5:1 sobre o cartão elevado (exceto os níveis nomeados do design)",
    (_name, css) => {
      expect(textColors(css).length).toBeGreaterThan(0);
      expect(darkFailures(css)).toEqual([]);
    },
  );

  it("o comentário /* design */ não isenta nada: branco a 20% falha mesmo com o comentário", () => {
    const css = ".x { color: rgba(255,255,255,0.2); /* design */ }";
    expect(darkFailures(css)).toEqual([".x → rgba(255,255,255,0.2)"]);
    expect(darkFailures(".x { color: rgba(255, 255, 255, 0.35); }")).not.toEqual([]);
  });

  it("os níveis nomeados do design continuam valendo (0.32 só no placeholder)", () => {
    for (const alpha of ["0.4", "0.45", "0.5", "0.55", "0.6"]) {
      expect(darkFailures(`.x { color: rgba(255, 255, 255, ${alpha}); }`), alpha).toEqual([]);
    }
    expect(darkFailures(".x::placeholder { color: rgba(255, 255, 255, 0.32); }")).toEqual([]);
    expect(darkFailures(".x { color: rgba(255, 255, 255, 0.32); }")).not.toEqual([]);
  });

  it("cinzas claros fora da lista nomeada falham nas telas claras, com ou sem /* design */", () => {
    expect(lightFailures(".x { color: #aaaaaa; /* design */ }")).toEqual([".x → #aaaaaa"]);
    expect(lightFailures(".x { color: #999999; }")).toEqual([".x → #999999"]);
    expect(lightFailures(".x { color: #8a8a8a; }")).toEqual([]);
  });

  it("branco em tela clara só passa sobre fundo conhecido ou nos seletores nomeados", () => {
    expect(lightFailures(".x { color: #ffffff; }")).toEqual([".x → #ffffff"]);
    expect(lightFailures(".x { background: #f2f2f2; color: #ffffff; /* design */ }")).not.toEqual([]);
    expect(lightFailures(".x { background: var(--color-primary-orange); color: #ffffff; }")).toEqual([]);
    expect(lightFailures(".fb-checkbox:checked::after { color: #ffffff; }")).toEqual([]);
    expect(lightFailures(".fb-checkbox-extra { color: #ffffff; }")).not.toEqual([]);
  });
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

/** Cor literal, token ou branco translúcido (composto sobre `bg`). Valor desconhecido lança, nunca passa calado. */
function resolveColor(value: string, bg: Rgb = ORANGE_RGB): Rgb {
  const variable = value.match(/^var\(--([\w-]+)\)$/);
  const resolved = variable ? token(variable[1]) : value;
  const rgba = resolved.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) return over([Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], Number(rgba[4]), bg);
  if (!/^#[0-9a-f]{3,6}$/i.test(resolved)) throw new Error(`cor não suportada no teste: ${value}`);
  return hex(resolved);
}

/** Regras cujo fundo é o laranja da marca, com o `color` declarado na própria regra (comentários não isentam). */
function orangeBackgrounds(css: string): { selector: string; color: string | undefined }[] {
  const found: { selector: string; color: string | undefined }[] = [];
  for (const [, selector, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/background(-color)?:[^;]*(primary-orange|#ed6e34)/i.test(body)) continue;
    found.push({
      selector: normalize(selector),
      color: body.match(/(?<![-\w])color:\s*([^;]+);/)?.[1].trim(),
    });
  }
  return found;
}

/** Falhas: todo fundo laranja precisa de texto com pelo menos o piso do par do design (3:1). */
function orangeFailures(css: string): string[] {
  return orangeBackgrounds(css)
    .filter(({ selector }) => !ORANGE_CHECKBOX_SELECTORS.has(selector))
    .filter(
      ({ color }) =>
        color === undefined || contrast(resolveColor(color), ORANGE_RGB) < WHITE_ON_ORANGE_FLOOR,
    )
    .map(({ selector, color }) => `${selector} → ${color ?? "sem color explícito"}`);
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
    expect(orangeFailures(css)).toEqual([]);
  });

  it("o /* design */ não isenta: texto que não chega a 3:1 sobre o laranja falha; o checkbox só pelos seletores exatos", () => {
    expect(orangeFailures(".x { background: #ed6e34; color: rgba(255,255,255,0.2); /* design */ }")).not.toEqual([]);
    expect(orangeFailures(".x { background: #ed6e34; color: #ffffff; /* design */ }")).toEqual([]);
    expect(orangeFailures(".x { background: #ed6e34; color: #000000; }")).toEqual([]);
    expect(orangeFailures(".x { background: #ed6e34; }")).toEqual([".x → sem color explícito"]);
    expect(orangeFailures(".fb-checkbox:checked { background: var(--color-primary-orange); }")).toEqual([]);
    expect(orangeFailures(".fb-checkbox-extra:checked { background: #ed6e34; }")).not.toEqual([]);
    expect(orangeFailures(".fb-checkbox:hover { background: #ed6e34; }")).not.toEqual([]);
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
