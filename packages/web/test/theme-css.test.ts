import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANUAL_DARK_SELECTOR,
  SYSTEM_DARK_MEDIA,
  SYSTEM_DARK_SELECTOR,
  THEMES,
  darkByChoice,
  darkBySystem,
  rawTokens,
  token,
} from "./theme-tokens";
import { THEME_COLOR } from "../src/lib/theme/theme";

/**
 * Tema claro e escuro no CSS e no HTML (D-038). Lê tokens.css, global.css e index.html do disco.
 * Os valores têm de bater com docs/design/design-system.md (as tabelas "Claro | Escuro" da proposta).
 */
const web = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const designSystem = readFileSync(join(process.cwd(), "../../docs/design/design-system.md"), "utf8");
const tokensCss = web("src/styles/tokens.css");
const globalCss = web("src/styles/global.css");
const indexHtml = web("index.html");

const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

/** Aprovados pelo dono (#156), mas só entram no código nos PRs que os usam: 12 (sidebar) e 17 (lista + detalhe). */
const NOT_YET_IN_CODE = new Set(["--sidebar-w", "--list-w"]);

/** Linhas `| \`--token\` | claro | escuro |` das tabelas do design system cujo cabeçalho é "Token | Claro | Escuro". */
function themedRows(): { name: string; light: string; dark: string }[] {
  const rows: { name: string; light: string; dark: string }[] = [];
  let themed = false;
  for (const line of designSystem.split("\n")) {
    if (!line.startsWith("|")) {
      themed = false;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Token") themed = cells[1] === "Claro" && cells[2] === "Escuro";
    else if (themed) {
      const name = cells[0].match(/^`(--[\w-]+)`$/)?.[1];
      if (name && !NOT_YET_IN_CODE.has(name)) rows.push({ name, light: cells[1], dark: cells[2] });
    }
  }
  return rows;
}

describe("valores dos tokens batem com a proposta (design-system.md)", () => {
  const rows = themedRows();

  it("lê as tabelas de marca, superfícies, estados e sombras", () => {
    const names = rows.map((r) => r.name);
    for (const name of ["--brand", "--bg", "--ink", "--danger", "--sh-1", "--sh-cta", "--sh-focus"]) {
      expect(names, name).toContain(name);
    }
  });

  it.each(rows.map((r) => [r.name, r] as const))("%s: claro e escuro iguais ao design system", (_name, row) => {
    expect(normalize(rawTokens.light[row.name]), `${row.name} claro`).toBe(normalize(row.light));
    // "—" = o escuro não muda o valor do claro.
    const dark = row.dark === "—" ? row.light : row.dark;
    expect(normalize(rawTokens.dark[row.name]), `${row.name} escuro`).toBe(normalize(dark));
  });
});

describe("temas pareados", () => {
  it("o escuro do sistema e o escuro manual declaram exatamente as mesmas variáveis e valores", () => {
    expect(Object.keys(darkBySystem).length).toBeGreaterThan(20);
    expect(darkBySystem).toEqual(darkByChoice);
  });

  it("o escuro do sistema só vale sem escolha manual de claro (o claro manual vence o sistema)", () => {
    expect(tokensCss).toContain(SYSTEM_DARK_MEDIA);
    expect(tokensCss).toContain(SYSTEM_DARK_SELECTOR);
    expect(tokensCss).toContain(MANUAL_DARK_SELECTOR);
  });

  it("color-scheme acompanha o tema: controles nativos e barras de rolagem", () => {
    const light = tokensCss.match(/\n:root \{\s*color-scheme:\s*light;/);
    expect(light).not.toBeNull();
    const system = tokensCss.match(
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{\s*color-scheme:\s*dark;/,
    );
    expect(system).not.toBeNull();
    expect(tokensCss).toMatch(/:root\[data-theme="dark"\] \{\s*color-scheme:\s*dark;/);
  });

  it("sombras: cada tema tem as quatro sombras, e o anel de foco (3px) é o mesmo nos dois", () => {
    for (const theme of THEMES) {
      for (const name of ["sh-1", "sh-2", "sh-3", "sh-cta"]) {
        expect(token(theme, name), `${name} ${theme}`).toMatch(/^0 \d+px \d+px rgba\(/);
      }
    }
    expect(token("light", "sh-1")).toContain("rgba(120,52,20");
    expect(token("dark", "sh-1")).toContain("rgba(0,0,0");
    expect(token("light", "sh-focus")).toBe(token("dark", "sh-focus"));
    expect(token("light", "sh-focus")).toMatch(/^0 0 0 3px /);
  });

  it("as sombras escuras saíram do bloco legado: existem só nos blocos de tema", () => {
    const legacy = tokensCss.slice(0, tokensCss.indexOf("/* Base de design aprovada"));
    expect(legacy).not.toMatch(/--sh-(1|2|3|cta|focus):/);
  });
});

describe("aliases legados (--color-*) apontam para os tokens da base", () => {
  const ALIASES: Record<string, string> = {
    "color-line": "line",
    "color-line-2": "line-2",
    "color-surface-000": "bg",
    "color-surface-raised": "surface",
    "color-surface-2": "surface-2",
    "color-ink-on-dark": "ink",
    "color-ink-2-on-dark": "ink-2",
    "color-text-muted-on-dark": "muted",
    "color-text-faint-on-dark": "faint",
    "color-on-dark-40": "faint",
    "color-on-dark-45": "faint",
    "color-on-dark-50": "muted",
    "color-on-dark-55": "muted",
    "color-on-dark-65": "muted",
    "color-primary-orange": "brand",
    "color-flame-red": "flame",
    "color-brand-strong": "brand-strong",
    "gradient-cta": "grad-cta",
    "color-danger": "danger",
    "color-danger-bg": "danger-bg",
    "color-danger-border": "danger-line",
    "color-success": "success",
    "color-success-bg": "success-bg",
    "color-success-border": "success-line",
    "color-warn": "warn",
    "color-warn-border": "brand-line",
    "color-warm-bg": "brand-tint",
    "color-info": "ink-2",
    "color-info-bg": "surface-2",
  };

  it.each(Object.entries(ALIASES))("--%s resolve para --%s nos dois temas", (legacy, target) => {
    for (const theme of THEMES) {
      expect(rawTokens[theme][`--${legacy}`], `${legacy} é um alias`).toMatch(/^var\(--/);
      expect(token(theme, legacy), `${legacy} ${theme}`).toBe(token(theme, target));
    }
  });

  it("nenhum --color-* legado é cor fixa escura: os que seguem fixos são os de texto sobre painel claro e o branco do laranja", () => {
    const fixed = Object.entries(rawTokens.light)
      .filter(([name, value]) => name.startsWith("--color-") && !value.startsWith("var("))
      .map(([name]) => name)
      .sort();
    expect(fixed).toEqual([
      "--color-accent-on-light",
      "--color-error-text-on-light",
      "--color-ink-on-light",
      "--color-on-orange",
      "--color-success-text-on-light",
      "--color-text-faint-on-light",
      "--color-text-muted-on-light",
    ]);
  });
});

describe("global.css segue o tema", () => {
  it("o corpo usa --bg e --ink", () => {
    expect(globalCss).toMatch(/body\s*\{[^}]*background:\s*var\(--bg\)[^}]*color:\s*var\(--ink\)/);
  });

  it("foco, seleção, cursor e controles nativos usam --brand", () => {
    expect(globalCss).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--brand\)/);
    expect(globalCss).toMatch(/::selection\s*\{[^}]*var\(--brand\)/);
    expect(globalCss).toMatch(/accent-color:\s*var\(--brand\)/);
    expect(globalCss).toMatch(/caret-color:\s*var\(--brand\)/);
  });

  it("sem cor literal nas regras de tema (fora dos tokens)", () => {
    const withoutComments = globalCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = ["body", ":focus-visible", "::selection", ".fb-skip-link"].map(
      (selector) => withoutComments.split("}").find((chunk) => chunk.split("{")[0].trim() === selector) ?? "",
    );
    for (const rule of rules) expect(rule).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });
});

describe("index.html: tema sem flash e sem script inline", () => {
  it("carrega public/theme-init.js, síncrono, antes de qualquer folha de estilo", () => {
    const script = indexHtml.indexOf('<script src="/theme-init.js"></script>');
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(indexHtml.indexOf('rel="stylesheet"'));
    expect(script).toBeLessThan(indexHtml.indexOf('type="module"'));
  });

  it("não tem script inline (a CSP do nginx usa script-src 'self')", () => {
    const inline = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
      ([, attrs, body]) => !/\bsrc=/.test(attrs) || body.trim() !== "",
    );
    expect(inline).toEqual([]);
  });

  it("declara os dois esquemas de cor e uma theme-color por tema, iguais ao --bg", () => {
    expect(indexHtml).toContain('<meta name="color-scheme" content="light dark" />');
    for (const theme of THEMES) {
      const meta = indexHtml.match(
        new RegExp(`<meta name="theme-color" content="(#[0-9A-Fa-f]{6})" media="\\(prefers-color-scheme: ${theme}\\)" />`),
      );
      expect(meta, `theme-color ${theme}`).not.toBeNull();
      expect(meta![1].toLowerCase()).toBe(token(theme, "bg").toLowerCase());
      expect(meta![1].toUpperCase()).toBe(THEME_COLOR[theme]);
    }
  });
});
