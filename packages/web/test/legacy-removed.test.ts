import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Estado final da refatoração da UI (#156, PR 18): o legado que a pilha manteve de propósito foi removido.
 * Substitui os testes de transição (dívida de migração, aliases `--color-*`, variantes "legado"): em vez de limitar
 * o que sobrava, proíbe que volte. Lê o código-fonte do disco, sem navegador.
 */
const WEB = process.cwd();
const SRC = join(WEB, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const files = walk(SRC).filter((path) => /\.(css|tsx?)$/.test(path));
const sources = files.map((path) => ({ path: relative(WEB, path), text: readFileSync(path, "utf8") }));
const sheets = sources.filter(({ path }) => path.endsWith(".css"));
const sheetsOutsideTokens = sheets.filter(({ path }) => !path.endsWith("styles/tokens.css"));
const code = sources.filter(({ path }) => /\.tsx?$/.test(path));
const tokensCss = readFileSync(join(SRC, "styles/tokens.css"), "utf8");
const designSystem = readFileSync(join(WEB, "../../docs/design/design-system.md"), "utf8");

const offenders = (list: typeof sources, pattern: RegExp, prepare = (text: string) => text) =>
  list.filter(({ text }) => pattern.test(prepare(text))).map(({ path }) => path);

describe("cores: só tokens da base", () => {
  it("nenhum --color-* (nem uso, nem declaração) e nenhum --gradient-cta em src", () => {
    expect(offenders(sources, /--color-[a-z]|--gradient-cta/, stripComments)).toEqual([]);
  });

  it("nenhum token legado de raio (--radius-*), de sombra antiga (--shadow-*) nem de cor sobre painel (-on-light, -on-dark)", () => {
    expect(offenders(sources, /--radius-|--shadow-|-on-light|-on-dark/, stripComments)).toEqual([]);
  });

  it("nenhum branco translúcido literal (rgba(255,255,255,x)) em folha de estilo ou TSX: nem de texto, nem de traço", () => {
    expect(offenders(sheetsOutsideTokens.concat(code), /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/i, stripComments)).toEqual([]);
  });

  it("nenhuma cor literal (hex, rgb, rgba, hsl) fora de tokens.css, nas folhas de estilo", () => {
    expect(offenders(sheetsOutsideTokens, /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/, stripComments)).toEqual([]);
  });

  it("o branco sobre o laranja é o token --on-brand, que está na base documentada", () => {
    expect(tokensCss).toMatch(/--on-brand:\s*#FFFFFF;/);
    expect(designSystem).toMatch(/\|\s*`--on-brand`\s*\|\s*#FFFFFF\s*\|/);
  });
});

describe("raio: só tokens --r-*", () => {
  it("nenhum border-radius em px literal fora de tokens.css (em CSS nem em estilo inline)", () => {
    const px = /border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*[^;{}]*\d+px/;
    expect(offenders(sheetsOutsideTokens, px, stripComments)).toEqual([]);
    expect(offenders(code, /borderRadius\s*:\s*["']?\d/)).toEqual([]);
  });
});

describe("classes antigas fora de uso", () => {
  // Cada família foi trocada por um componente `fb-ui-*` (campo, botão, badge, card, tabela, abas, diálogo, estado).
  const REMOVED = [
    "fb-field", "fb-badge", "fb-card", "fb-btn-[a-z-]+", "fb-checkbox", "fb-th", "fb-td", "fb-tabs", "fb-tab-btn",
    "fb-table-wrap", "fb-toolbar", "fb-filter", "fb-form", "fb-row--inactive", "fb-page-(?:header|title|eyebrow)",
    "fb-modal(?:-backdrop|__[a-z-]+)?", "fb-state(?:__[a-z-]+|--[a-z-]+)?", "fb-container", "fb-client-empty",
    "login-form(?:__[a-z-]+)?",
  ];
  const classPattern = new RegExp(`(?<![\\w-])(?:${REMOVED.join("|")})(?![\\w-])`);

  it("nenhuma classe antiga (fb-field, fb-badge, fb-card, fb-btn-*, fb-modal, fb-state...) em CSS", () => {
    expect(offenders(sheets, classPattern, stripComments)).toEqual([]);
  });

  it("nenhuma classe antiga em TSX/TS de src (nem em strings de className)", () => {
    expect(offenders(code, classPattern)).toEqual([]);
  });
});

describe("componentes legados removidos", () => {
  it("components/states.tsx e styles/states.css não existem; ninguém importa components/states", () => {
    expect(existsSync(join(SRC, "components/states.tsx"))).toBe(false);
    expect(existsSync(join(SRC, "styles/states.css"))).toBe(false);
    expect(offenders(code, /components\/states["']|\.\/states["']/)).toEqual([]);
    expect(offenders(code, /styles\/states\.css/)).toEqual([]);
  });

  it("a prop `surface` dos estados antigos (light|dark) não existe mais", () => {
    expect(offenders(code, /StateSurface|surface\??:\s*["']?(?:light|dark)|surface=["'](?:light|dark)["']/)).toEqual([]);
  });

  it("HomeBlockState saiu: a Home usa QueryBlockState, como as demais telas", () => {
    expect(existsSync(join(SRC, "pages/home/HomeBlockState.tsx"))).toBe(false);
    expect(offenders(code, /HomeBlockState/)).toEqual([]);
    const home = readFileSync(join(SRC, "pages/ClientHomePage.tsx"), "utf8");
    expect(home).toContain("QueryBlockState");
  });

  it("o componente Modal antigo saiu: o diálogo é ui/Dialog (components/Modal.tsx guarda só os hooks de foco)", () => {
    const modal = readFileSync(join(SRC, "components/Modal.tsx"), "utf8");
    expect(modal).not.toMatch(/export function Modal\b/);
    expect(modal).toMatch(/export function useDialogFocus/);
    expect(modal).toMatch(/export function useCloseOnEscape/);
    expect(offenders(code, /<Modal[\s>]/)).toEqual([]);
  });
});

describe("tokens: nada declarado sem uso", () => {
  // Tokens da base aprovada (design-system.md) ficam mesmo sem uso; o resto tem de ser usado.
  const documented = new Set([...designSystem.matchAll(/`(--[a-z0-9-]+)`/g)].map(([, name]) => name));
  // Papéis da tabela de Tipografia do design system que viram token (a tabela cita o papel, não o nome do token).
  const TYPOGRAPHY_ROLES = ["--text-display", "--leading-display", "--tracking-display"];
  const declared = [...stripComments(tokensCss).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(([, name]) => name);
  const usage = sources
    .filter(({ path }) => !path.endsWith("styles/tokens.css"))
    .concat([{ path: "tokens.css (referências internas)", text: stripComments(tokensCss).replace(/^\s*--[a-z0-9-]+\s*:/gm, "") }])
    .map(({ text }) => text)
    .join("\n");

  it("todo token declarado em tokens.css é usado ou faz parte da base documentada", () => {
    const dead = [...new Set(declared)].filter(
      (name) => !documented.has(name) && !TYPOGRAPHY_ROLES.includes(name) && !usage.includes(`var(${name}`),
    );
    expect(dead).toEqual([]);
  });

  it("tokens.css tem o bloco de tokens fixos, o da base de design (claro) e os de tema escuro, sem bloco legado", () => {
    expect(tokensCss).not.toMatch(/Cores legadas|aliases dos tokens da base/);
    expect(tokensCss.match(/^:root \{/gm)).toHaveLength(2);
  });
});
