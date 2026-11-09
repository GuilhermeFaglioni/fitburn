import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tokens de tokens.css resolvidos por tema, para os testes que leem o CSS (não há navegador na suíte).
 *
 * - claro: o `:root` sem media query;
 * - escuro do sistema: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`;
 * - escuro manual: `:root[data-theme="dark"]`.
 * O escuro vale sobre o claro. `var(--x)` é resolvido dentro do tema (como o navegador faz no :root), então um alias
 * legado (`--color-line: var(--line)`) devolve o valor do tema pedido.
 */
export type ThemeName = "light" | "dark";
export type Rgb = [number, number, number];

export const THEMES: ThemeName[] = ["light", "dark"];

const tokensCss = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

interface Rule {
  media: string | null;
  selector: string;
  body: string;
}

function parseRules(css: string, media: string | null = null): Rule[] {
  const rules: Rule[] = [];
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open === -1) break;
    const header = css.slice(index, open).trim();
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}") depth--;
      end++;
    }
    const body = css.slice(open + 1, end - 1);
    if (header.startsWith("@")) rules.push(...parseRules(body, header));
    else rules.push({ media, selector: header.replace(/\s+/g, " "), body });
    index = end;
  }
  return rules;
}

function declarations(body: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) found[name] = value.trim();
  return found;
}

const rules = parseRules(tokensCss.replace(/\/\*[\s\S]*?\*\//g, ""));
const merge = (selected: Rule[]) => Object.assign({}, ...selected.map((rule) => declarations(rule.body)));

export const SYSTEM_DARK_SELECTOR = ':root:not([data-theme="light"])';
export const MANUAL_DARK_SELECTOR = ':root[data-theme="dark"]';
export const SYSTEM_DARK_MEDIA = "@media (prefers-color-scheme: dark)";

/** Declarações do tema escuro, só as que ele sobrescreve. */
export const darkBySystem = merge(
  rules.filter((r) => r.media === SYSTEM_DARK_MEDIA && r.selector === SYSTEM_DARK_SELECTOR),
);
export const darkByChoice = merge(rules.filter((r) => r.media === null && r.selector === MANUAL_DARK_SELECTOR));

const light = merge(rules.filter((r) => r.media === null && r.selector === ":root"));

/** Todas as declarações de cada tema (o escuro por cima do claro), sem resolver `var()`. */
export const rawTokens: Record<ThemeName, Record<string, string>> = {
  light,
  dark: { ...light, ...darkByChoice },
};

/** Valor do token no tema, com `var(--x)` resolvido. Token que não existe lança. */
export function token(theme: ThemeName, name: string): string {
  const all = rawTokens[theme];
  const resolve = (value: string, depth = 0): string => {
    if (depth > 10) throw new Error(`ciclo de var() em --${name}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => {
      const next = all[ref];
      if (next === undefined) throw new Error(`token ${ref} não encontrado (usado por --${name})`);
      return resolve(next, depth + 1);
    });
  };
  const raw = all[`--${name}`];
  if (raw === undefined) throw new Error(`token --${name} não encontrado no tema ${theme}`);
  return resolve(raw);
}

export function hex(value: string): Rgb {
  const h = value.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Cor `fg` com opacidade `alpha` sobre `bg`. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

/** `#hex` ou `rgba(r,g,b,a)` -> cor sólida; o `rgba` é composto sobre `bg`. Valor desconhecido lança. */
export function toRgb(value: string, bg: Rgb): Rgb {
  const rgba = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgba) return over([Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], Number(rgba[4]), bg);
  if (/^#[0-9a-f]{3,6}$/i.test(value)) return hex(value);
  throw new Error(`cor não suportada no teste: ${value}`);
}

/** Cor de um token no tema, como sólida. Tokens translúcidos (--danger-bg) são compostos sobre `bg`. */
export function color(theme: ThemeName, name: string, bg: Rgb = hex(token(theme, "bg"))): Rgb {
  return toRgb(token(theme, name), bg);
}
