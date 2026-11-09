import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import adminCss from "../src/styles/admin.css?raw";
import componentsCss from "../src/styles/components.css?raw";
import {
  THEMES,
  color,
  contrast,
  hex,
  over,
  token,
  toRgb,
  type Rgb,
  type ThemeName,
} from "./theme-tokens";

/**
 * Contraste WCAG (2.x) dos pares de cor do design system e das folhas de estilo, NOS DOIS TEMAS (D-038).
 * Não há navegador na suíte, então o teste lê o CSS e resolve os tokens de cada tema (test/theme-tokens.ts).
 *
 * O design vence: alguns pares que ele usa ficam abaixo de 4.5:1 e estão registrados aqui como
 * EXCEÇÕES CONHECIDAS DO DESIGN, cada uma com o valor de contraste medido. Todo o resto continua exigindo 4.5:1
 * (ou o mínimo da própria exceção), para o texto não deslizar para cinzas ainda mais claros:
 * - branco sobre o laranja da marca (botões, chips, abas): 3.05:1 (o preto daria 6.5:1); o design usa 700 e 13-15px;
 * - laranja da marca como texto/traço sobre branco (tema claro): 3.05:1; o texto laranja do tema claro é --brand-strong;
 * - --faint (rótulos auxiliares, linhas inativas): 3.85:1 sobre branco no tema claro e 4.48:1 sobre o cartão no escuro;
 * - branco a 45% sobre o cartão elevado (literais ainda não migrados): 4.47:1; a 40%: 3.83:1; placeholder a 32%: 2.90:1.
 */

const WHITE: Rgb = [255, 255, 255];
const surfaceOf = (theme: ThemeName) => hex(token(theme, "surface"));
const bgOf = (theme: ThemeName) => hex(token(theme, "bg"));
const FILL_NAMES = ["bg", "bg-soft", "surface", "surface-2"] as const;

describe.each(THEMES)("contraste dos tokens de texto (tema %s)", (theme) => {
  it.each(["ink", "ink-2", "muted", "brand-strong", "danger", "success", "warn"])(
    "--%s passa de 4.5:1 sobre a página, a página suave, o cartão e a superfície 2",
    (name) => {
      for (const fill of FILL_NAMES) {
        expect(contrast(color(theme, name), color(theme, fill)), `${name} sobre ${fill}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("o texto de erro passa de 4.5:1 sobre o fundo do aviso (fundo translúcido composto sobre a página e o cartão)", () => {
    for (const base of [bgOf(theme), surfaceOf(theme)]) {
      const tint = color(theme, "danger-bg", base);
      expect(contrast(color(theme, "danger"), tint)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sucesso e aviso passam de 4.5:1 sobre o próprio fundo", () => {
    for (const [text, fill] of [
      ["success", "success-bg"],
      ["warn", "warn-bg"],
    ] as const) {
      for (const base of [bgOf(theme), surfaceOf(theme)]) {
        expect(contrast(color(theme, text), color(theme, fill, base)), text).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gradiente CTA (decisão #136): o branco passa de 4.5:1 no fim (#C23A1F, 5.36:1), mas o início (#F58A55) dá 2.43:1, abaixo de 3:1 — registrado para decisão", () => {
    expect(token(theme, "grad-cta")).toContain("#C23A1F");
    expect(token(theme, "gradient-cta")).toBe(token(theme, "grad-cta"));
    expect(contrast(WHITE, hex("#c23a1f"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, hex("#f58a55"))).toBeCloseTo(2.43, 1);
  });
});

describe("laranja da marca como texto", () => {
  it("no tema escuro o laranja passa de 4.5:1 sobre a página, o cartão e a superfície 2", () => {
    for (const fill of ["bg", "surface", "surface-2"]) {
      expect(contrast(color("dark", "brand"), color("dark", fill)), fill).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("exceção do design: no tema claro o laranja dá 3.05:1 sobre branco; o texto laranja do tema claro é --brand-strong (#A8401A, 6.15:1)", () => {
    expect(contrast(color("light", "brand"), WHITE)).toBeCloseTo(3.05, 1);
    expect(token("light", "brand-strong")).toBe("#A8401A");
    expect(contrast(color("light", "brand-strong"), WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("texto secundário (--muted e --faint)", () => {
  it("--muted passa de 4.5:1 nos dois temas (#6b5d55 sobre branco no claro; #a39a94 sobre o cartão no escuro)", () => {
    expect(token("light", "muted")).toBe("#6B5D55");
    expect(token("dark", "muted")).toBe("#A39A94");
    for (const theme of THEMES) {
      expect(contrast(color(theme, "muted"), surfaceOf(theme))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("exceção do design: --faint dá 3.85:1 sobre branco no claro (#8e7f76, linhas inativas e rótulos auxiliares)", () => {
    expect(token("light", "faint")).toBe("#8E7F76");
    expect(contrast(color("light", "faint"), WHITE)).toBeCloseTo(3.85, 1);
  });

  it("exceção do design: --faint dá 4.48:1 sobre o cartão no escuro (#857b75) e passa de 4.5:1 sobre a página", () => {
    expect(contrast(color("dark", "faint"), color("dark", "bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color("dark", "faint"), color("dark", "surface"))).toBeCloseTo(4.48, 1);
  });

  it("os níveis legados 50, 55 e 65% viram --muted e passam de 4.5:1; 40 e 45% viram --faint (as exceções acima)", () => {
    for (const theme of THEMES) {
      for (const name of ["color-on-dark-50", "color-on-dark-55", "color-on-dark-65"]) {
        expect(token(theme, name), name).toBe(token(theme, "muted"));
        expect(contrast(color(theme, name), surfaceOf(theme)), `${name} ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const name of ["color-on-dark-40", "color-on-dark-45"]) {
        expect(token(theme, name), name).toBe(token(theme, "faint"));
      }
    }
  });

  it("texto sobre painel claro fixo (-on-light) são os valores do tema claro e passam sobre branco", () => {
    const fixed: [string, string, number][] = [
      ["color-ink-on-light", "ink", 4.5],
      ["color-text-muted-on-light", "muted", 4.5],
      ["color-text-faint-on-light", "faint", 3.8],
      ["color-accent-on-light", "brand-strong", 4.5],
    ];
    for (const [legacy, target, floor] of fixed) {
      expect(token("light", legacy).toLowerCase(), legacy).toBe(token("light", target).toLowerCase());
      expect(contrast(hex(token("light", legacy)), WHITE), legacy).toBeGreaterThanOrEqual(floor);
    }
    expect(
      contrast(hex(token("light", "color-error-text-on-light")), color("light", "danger-bg")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * POLÍTICA DE CONTRASTE DAS FOLHAS DE ESTILO
 *
 * Toda declaração `color` é checada em cada tema; o comentário `/* design *\/` NÃO isenta nada. Só valem as exceções
 * NOMEADAS abaixo, cada uma com o piso mínimo da razão de contraste medida. Qualquer outro valor exige 4.5:1.
 * (`color: rgba(255,255,255,0.2); /* design *\/` falha, por exemplo.)
 *
 * Cor vinda de token é resolvida no tema (o alias `--color-ink-on-dark` vale branco no escuro e #1c1714 no claro) e
 * medida contra o fundo da própria regra ou, sem ele, contra o cartão do tema.
 * Branco translúcido LITERAL (`rgba(255,255,255,x)`) só existe nas telas ainda não migradas e é checado no tema escuro,
 * que é para onde foi escrito; no claro ele é dívida de migração, limitada em "dívida de migração" abaixo.
 */

/** Piso do par "branco sobre o laranja da marca" (3.05:1 medido). */
const WHITE_ON_ORANGE_FLOOR = 3;

/** Cores de texto em hex que ficam abaixo de 4.5:1 por decisão do design, por tema, com o piso da razão medida. */
const HEX_EXCEPTIONS: Record<ThemeName, Record<string, { floor: number; why: string }>> = {
  light: {
    "#8e7f76": { floor: 3.8, why: "--faint: cinza de linha inativa da proposta (3.85:1), não é texto de conteúdo" },
    "#c8c8c8": { floor: 1.6, why: "travessão da coluna de ações (1.67:1, decorativo)" },
  },
  dark: {
    "#857b75": { floor: 4.4, why: "--faint: rótulo secundário da proposta (4.48:1 sobre o cartão)" },
  },
};

/**
 * Seletores EXATOS cuja cor de texto é branco sem fundo na própria regra:
 * - "orange": o fundo laranja vem de outra regra (o visto do checkbox, gráfico; o botão primário, que herda o
 *   gradiente CTA; o botão do formulário de metas): vale o piso de 3:1 do par do design;
 * - "no-text": barras de progresso, sem texto (o `color` só existe para o guarda de fundos laranja).
 */
const WHITE_NO_BACKGROUND = new Map<string, "orange" | "no-text">([
  [".fb-checkbox:checked::after", "orange"],
  [".fb-checkbox.fb-checkbox--fixed:disabled:checked::after", "orange"],
  [".fb-goals__form .fb-btn-primary", "orange"],
  [".fb-btn-primary", "orange"],
  // Presente (laranja) e Faltou (vermelho-chama, 5.36:1) acrescentam o fundo pelos modificadores --present e --absent.
  ['.fb-seg-btn[aria-pressed="true"]', "orange"],
  // Selo "ATIVO" do cartão do plano da Home (D-038): negrito branco translúcido-sobre-laranja; o gradiente CTA está no
  // cartão (.fb-home__plan), não no selo. Vale o mesmo piso de 3:1 do par do design.
  [".fb-home__badge", "orange"],
  [".fb-goals__bar-fill", "no-text"],
  [".fb-dash__meter-fill", "no-text"],
]);

/**
 * Regras laranja do checkbox (o fundo está na regra; o visto `::after` está em WHITE_NO_BACKGROUND):
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

/** Pares nomeados (seletor exato, cor de texto) sobre fundo que não é o cartão elevado (tema escuro). */
const DARK_NAMED_PAIRS: { selector: string; value: string; floor: number; bg: Rgb; why: string }[] = [
  {
    selector: ".fb-gami__mark--pending",
    value: "rgba(255, 255, 255, 0.4)",
    floor: 3,
    bg: surfaceOf("dark"),
    why: "marco ainda não alcançado: elemento gráfico (3:1), não texto",
  },
];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

/** `var(--token)` vira o valor do token no tema; token que não vem de tokens.css (variável local) fica como está. */
function resolveVar(value: string, theme: ThemeName): string {
  const name = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  if (!name) return value;
  try {
    return token(theme, name);
  } catch {
    return value;
  }
}

/** Regras `seletor { ... color: valor; ... }` de uma folha de estilo (todas, sem escape por comentário). */
function textColors(css: string): { selector: string; raw: string; body: string }[] {
  const found: { selector: string; raw: string; body: string }[] = [];
  for (const [, selector, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const [, value] of body.matchAll(/(?<![-\w])color:\s*([^;]+);/g)) {
      found.push({ selector: normalize(selector), raw: value.trim(), body });
    }
  }
  return found;
}

const isHex = (value: string) => /^#[0-9a-f]{3,6}$/i.test(value);
const WHITE_ALPHA = /^rgba\(255,\s*255,\s*255,\s*([\d.]+)\)$/;
const hasOrangeBackground = (body: string) =>
  /background(-color)?:[^;]*(primary-orange|gradient-cta|grad-cta|#ed6e34)/i.test(body);

/** Fundo sólido da regra: hex, token, ou `color-mix(in srgb, A N%, B)` de duas cores sólidas (o aviso de sem conexão). */
function backgroundOf(body: string, theme: ThemeName): Rgb | undefined {
  const value = body.match(/(?<![-\w])background(?:-color)?:\s*([^;]+);/)?.[1].trim();
  if (!value) return undefined;
  const mix = value.match(/^color-mix\(in srgb,\s*(var\(--[\w-]+\))\s+(\d+)%,\s*(var\(--[\w-]+\))\)$/);
  if (mix) {
    const [top, bottom] = [resolveVar(mix[1], theme), resolveVar(mix[3], theme)];
    return isHex(top) && isHex(bottom) ? over(hex(top), Number(mix[2]) / 100, hex(bottom)) : undefined;
  }
  const resolved = resolveVar(value, theme);
  return isHex(resolved) ? hex(resolved) : undefined;
}

/** Falhas de contraste do texto de uma folha de estilo num tema. */
function failures(css: string, theme: ThemeName): string[] {
  const out: string[] = [];
  const surface = surfaceOf(theme);
  for (const { selector, raw, body } of textColors(css)) {
    // Painel claro explícito (modificador --light): o texto escuro é do painel, não do fundo do tema.
    if (/--light\b/.test(selector)) continue;
    // Controles desabilitados são isentos pela própria WCAG (1.4.3), exceto os nomeados.
    if (selector.includes(":disabled") && !WHITE_NO_BACKGROUND.has(selector)) continue;

    const value = resolveVar(raw, theme);
    const label = `${selector} → ${raw}`;

    if (isHex(value)) {
      const lower = value.toLowerCase();
      if (lower === "#ffffff" || lower === "#fff") {
        const named = WHITE_NO_BACKGROUND.get(selector);
        if (named) {
          if (named === "orange" && contrast(WHITE, hex(token(theme, "brand"))) < WHITE_ON_ORANGE_FLOOR) {
            out.push(label);
          }
          continue;
        }
        // Branco sobre o laranja da marca (ou o gradiente CTA): o par é checado em orangeFailures.
        if (hasOrangeBackground(body)) continue;
        const bg = backgroundOf(body, theme) ?? surface;
        const isOrange = contrast(bg, hex(token(theme, "brand"))) < 1.05;
        if (contrast(WHITE, bg) < (isOrange ? WHITE_ON_ORANGE_FLOOR : 4.5)) out.push(label);
        continue;
      }
      const bg = backgroundOf(body, theme) ?? surface;
      const floor = HEX_EXCEPTIONS[theme][lower]?.floor ?? 4.5;
      if (contrast(hex(value), bg) < floor) out.push(label);
      continue;
    }

    // Branco translúcido literal: telas ainda não migradas, escritas para o tema escuro.
    const alpha = value.match(WHITE_ALPHA)?.[1];
    if (alpha === undefined || theme !== "dark") continue;
    const pair = DARK_NAMED_PAIRS.find((p) => p.selector === selector && p.value === value.replace(/,\s*/g, ", "));
    let floor = 4.5;
    let bg = surface;
    if (pair) {
      floor = pair.floor;
      bg = pair.bg;
    } else {
      const named = DARK_ALPHA_EXCEPTIONS[String(Number(alpha))];
      if (named && (!named.only || selector.includes(named.only))) floor = named.floor;
    }
    if (contrast(over(WHITE, Number(alpha), bg), bg) < floor) out.push(label);
  }
  return out;
}

describe.each(THEMES)("cores de texto das folhas de estilo (tema %s)", (theme) => {
  it.each(allSheets())(
    "%s: todo texto passa de 4.5:1 sobre o fundo (exceto as exceções nomeadas do design)",
    (_name, css) => {
      expect(failures(css, theme)).toEqual([]);
    },
  );

  it("lê as declarações de cor de texto das folhas (o teste não passa vazio)", () => {
    expect(allSheets().flatMap(([, css]) => textColors(css)).length).toBeGreaterThan(200);
  });
});

describe("a política de contraste", () => {
  it("o comentário /* design */ não isenta nada: branco a 20% falha mesmo com o comentário", () => {
    const css = ".x { color: rgba(255,255,255,0.2); /* design */ }";
    expect(failures(css, "dark")).toEqual([".x → rgba(255,255,255,0.2)"]);
    expect(failures(".x { color: rgba(255, 255, 255, 0.35); }", "dark")).not.toEqual([]);
  });

  it("os níveis nomeados do design continuam valendo no escuro (0.32 só no placeholder)", () => {
    for (const alpha of ["0.4", "0.45", "0.5", "0.55", "0.6"]) {
      expect(failures(`.x { color: rgba(255, 255, 255, ${alpha}); }`, "dark"), alpha).toEqual([]);
    }
    expect(failures(".x::placeholder { color: rgba(255, 255, 255, 0.32); }", "dark")).toEqual([]);
    expect(failures(".x { color: rgba(255, 255, 255, 0.32); }", "dark")).not.toEqual([]);
  });

  it("cinzas claros fora da lista nomeada falham no tema claro, com ou sem /* design */", () => {
    expect(failures(".x { color: #aaaaaa; /* design */ }", "light")).toEqual([".x → #aaaaaa"]);
    expect(failures(".x { color: #999999; }", "light")).toEqual([".x → #999999"]);
    expect(failures(".x { color: #8e7f76; }", "light")).toEqual([]);
  });

  it("cinzas escuros fora da lista nomeada falham no tema escuro", () => {
    expect(failures(".x { color: #444444; }", "dark")).toEqual([".x → #444444"]);
    expect(failures(".x { color: #857b75; }", "dark")).toEqual([]);
  });

  it("token de texto é medido no tema: o alias passa nos dois, e um fundo fixo escuro reprova o tema claro", () => {
    const css = ".x { color: var(--color-text-muted-on-dark); }";
    for (const theme of THEMES) expect(failures(css, theme), theme).toEqual([]);
    const onDark = ".x { background: #0a0a0a; color: var(--color-ink-on-dark); }";
    expect(failures(onDark, "dark")).toEqual([]);
    expect(failures(onDark, "light")).toEqual([".x → var(--color-ink-on-dark)"]);
  });

  it("branco só passa sobre fundo conhecido ou nos seletores nomeados", () => {
    expect(failures(".x { color: #ffffff; }", "light")).toEqual([".x → #ffffff"]);
    expect(failures(".x { background: #f2f2f2; color: #ffffff; /* design */ }", "dark")).not.toEqual([]);
    expect(failures(".x { background: var(--color-primary-orange); color: #ffffff; }", "light")).toEqual([]);
    expect(failures(".fb-checkbox:checked::after { color: #ffffff; }", "light")).toEqual([]);
    expect(failures(".fb-checkbox-extra { color: #ffffff; }", "light")).not.toEqual([]);
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

describe("dívida de migração: branco translúcido literal nas telas ainda não migradas", () => {
  /** Quantidade medida em #156 (45 no PR 2; 43 depois da Agenda; 39 depois do Login). Cada PR de tela só pode reduzir; o PR 18 troca este teste por proibição. */
  const LITERAL_WHITE_ALPHA_TEXT_CEILING = 39;

  it("não cresce: texto novo usa tokens, que seguem o tema", () => {
    const count = allSheets()
      .filter(([name]) => name !== "styles/tokens.css")
      .flatMap(([, css]) => textColors(css))
      .filter(({ raw }) => WHITE_ALPHA.test(raw)).length;
    expect(count).toBeLessThanOrEqual(LITERAL_WHITE_ALPHA_TEXT_CEILING);
  });
});

/** Cor literal, token ou branco translúcido (composto sobre `bg`) no tema. Valor desconhecido lança, nunca passa calado. */
function resolveColor(value: string, theme: ThemeName, bg: Rgb = hex(token(theme, "brand"))): Rgb {
  return toRgb(resolveVar(value, theme), bg);
}

/** Regras cujo fundo é o laranja da marca, com o `color` declarado na própria regra (comentários não isentam). */
function orangeBackgrounds(css: string): { selector: string; color: string | undefined }[] {
  const found: { selector: string; color: string | undefined }[] = [];
  for (const [, selector, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!hasOrangeBackground(body)) continue;
    found.push({
      selector: normalize(selector),
      color: body.match(/(?<![-\w])color:\s*([^;]+);/)?.[1].trim(),
    });
  }
  return found;
}

/** Falhas: todo fundo laranja precisa de texto com pelo menos o piso do par do design (3:1). */
function orangeFailures(css: string, theme: ThemeName = "dark"): string[] {
  const orange = hex(token(theme, "brand"));
  return orangeBackgrounds(css)
    .filter(({ selector }) => !ORANGE_CHECKBOX_SELECTORS.has(selector))
    .filter(
      ({ color: text }) =>
        text === undefined || contrast(resolveColor(text, theme, orange), orange) < WHITE_ON_ORANGE_FLOOR,
    )
    .map(({ selector, color: text }) => `${selector} → ${text ?? "sem color explícito"}`);
}

describe.each(THEMES)("botões primários (texto sobre o laranja da marca, tema %s)", (theme) => {
  const ORANGE = hex(token(theme, "brand"));
  /** Exceção do design: branco em negrito sobre o laranja, 3.05:1 (o preto daria 6.5:1). Piso da exceção: 3:1. */
  const DESIGN_PAIR_MIN = 3;

  it("exceção do design: o texto sobre o laranja (token color-on-orange) é branco e dá 3.05:1", () => {
    expect(token(theme, "color-on-orange").toLowerCase()).toBe("#ffffff");
    const ratio = contrast(resolveColor("var(--color-on-orange)", theme), ORANGE);
    expect(ratio).toBeCloseTo(3.05, 1);
    expect(ratio).toBeGreaterThanOrEqual(DESIGN_PAIR_MIN);
  });

  it("o preto sobre o laranja passaria de 4.5:1 (o trade-off que o design decidiu não seguir)", () => {
    expect(contrast(hex("#0a0a0a"), ORANGE)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(allSheets())("%s: todo fundo laranja usa o par do design (3:1 ou mais)", (_name, css) => {
    expect(orangeFailures(css, theme)).toEqual([]);
  });

  it("o botão primário do painel e o dia da recorrência marcado usam o par do design", () => {
    const rules = orangeBackgrounds(adminCss + componentsCss);
    for (const selector of [".fb-btn-primary", '.fb-weekday-toggle[aria-pressed="true"]']) {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule, selector).toBeDefined();
      expect(contrast(resolveColor(rule?.color ?? "#ffffff", theme), ORANGE)).toBeGreaterThanOrEqual(DESIGN_PAIR_MIN);
    }
  });

  it("o botão de entrar do login é o Button primário compartilhado, cujo texto sobre o laranja chega a 3:1", () => {
    const login = readFileSync(resolve(process.cwd(), "src/pages/LoginPage.tsx"), "utf8");
    expect(login).toMatch(/<Button type="submit" variant="primary" block/);
    const primary = orangeBackgrounds(componentsCss).find(({ selector }) => selector === ".fb-ui-btn--primary");
    expect(primary).toBeDefined();
    expect(contrast(resolveColor(primary?.color ?? "#ffffff", theme), ORANGE)).toBeGreaterThanOrEqual(DESIGN_PAIR_MIN);
  });
});

describe("botões primários: a política", () => {
  it("o /* design */ não isenta: texto que não chega a 3:1 sobre o laranja falha; o checkbox só pelos seletores exatos", () => {
    expect(orangeFailures(".x { background: #ed6e34; color: rgba(255,255,255,0.2); /* design */ }")).not.toEqual([]);
    expect(orangeFailures(".x { background: #ed6e34; color: #ffffff; /* design */ }")).toEqual([]);
    expect(orangeFailures(".x { background: #ed6e34; color: #000000; }")).toEqual([]);
    expect(orangeFailures(".x { background: #ed6e34; }")).toEqual([".x → sem color explícito"]);
    expect(orangeFailures(".fb-checkbox:checked { background: var(--color-primary-orange); }")).toEqual([]);
    expect(orangeFailures(".fb-checkbox-extra:checked { background: #ed6e34; }")).not.toEqual([]);
    expect(orangeFailures(".fb-checkbox:hover { background: #ed6e34; }")).not.toEqual([]);
  });

  it("o chip de dia marcado da agenda é o Chip compartilhado: texto sobre o laranja (token color-on-orange) com 3:1 ou mais", () => {
    const agendaCss = readFileSync(resolve(process.cwd(), "src/styles/agenda.css"), "utf8");
    // A agenda não tem chip de dia próprio: usa .fb-ui-chip (components.css), já coberto por orangeFailures.
    expect(agendaCss).not.toMatch(/daychip|fb-ui-chip/);
    const marked = orangeBackgrounds(componentsCss).find(({ selector }) => selector === '.fb-ui-chip[aria-pressed="true"]');
    expect(marked?.color).toBe("var(--color-on-orange)");
    for (const theme of THEMES) {
      const orange = hex(token(theme, "brand"));
      expect(contrast(resolveColor("var(--color-on-orange)", theme), orange), theme).toBeGreaterThanOrEqual(3);
    }
  });
});
