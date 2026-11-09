import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Navegação e layout (DS5, seção 5 do fluxo). Lê o CSS do disco.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(css|tsx|ts)$/.test(name) ? [path] : [];
  });
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const tokens = read("styles/tokens.css");
const global = read("styles/global.css");
const client = read("styles/client.css");
const admin = read("styles/admin.css");
const appMenu = read("components/AppMenu.css");
const responsive = read("styles/responsive.css");
const components = read("styles/components.css");

describe("espaçamento e container", () => {
  it("escala de espaçamento base 4: todo --s-N declarado vale N x 4px, e os da base aprovada existem", () => {
    const declared = [...tokens.matchAll(/--s-(\d+):\s*(\d+)px;/g)].map(([, n, px]) => [Number(n), Number(px)]);
    for (const [n, px] of declared) expect(px, `--s-${n}`).toBe(n * 4);
    const names = declared.map(([n]) => n);
    for (const n of [1, 2, 3, 4, 5, 6, 8, 12, 16, 24]) expect(names, `--s-${n}`).toContain(n);
  });

  it("todo --s-N declarado é usado por alguma folha de estilo ou componente (nada de degrau sem uso)", () => {
    const sources = walk(join(process.cwd(), "src"))
      .filter((path) => !path.endsWith("styles/tokens.css"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const unused = [...tokens.matchAll(/--s-(\d+):/g)]
      .map(([, n]) => n)
      .filter((n) => !sources.includes(`var(--s-${n})`) && ![1, 2, 3, 4, 5, 6, 8, 12, 16, 24].includes(Number(n)));
    expect(unused).toEqual([]);
  });

  it("o contêiner do conteúdo (admin) usa a largura máxima e o respiro lateral por token", () => {
    const body = admin.match(/\.fb-admin-content\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/max-width:\s*var\(--container-max\)/);
    expect(global).not.toContain(".fb-container");
  });
});

describe("navegação do cliente", () => {
  it("item de navegação com alvo de 44px", () => {
    const body = client.match(/\.fb-client__nav-item\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/min-height:\s*44px/);
  });

  it("estado ativo também pela página atual (aria-current)", () => {
    expect(client).toMatch(/\.fb-client__nav-item\[aria-current="page"\]/);
  });
});

describe("tabela e diálogo", () => {
  it("a rolagem horizontal da tabela fica dentro do próprio componente", () => {
    const body = components.match(/\.fb-ui-table-wrap\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/overflow-x:\s*auto/);
  });

  it("linhas da tabela têm destaque ao passar o mouse", () => {
    expect(components).toMatch(/\.fb-ui-table tbody tr:hover/);
  });

  it("o diálogo usa o raio --r-xl e a sombra de diálogo (--sh-3)", () => {
    const body = components.match(/\.fb-ui-dialog\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/box-shadow:\s*var\(--sh-3\)/);
    expect(body).toMatch(/border-radius:\s*var\(--r-xl\)/);
  });
});

/** Corpo da primeira regra cujo seletor é exatamente `selector` (comentários fora). */
function body(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return clean.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("casca do admin (PR 12, #156)", () => {
  it("--sidebar-w (224px) e --list-w (260px) existem como tokens aprovados", () => {
    expect(tokens).toMatch(/--sidebar-w:\s*224px;/);
    expect(tokens).toMatch(/--list-w:\s*260px;/);
  });

  it("a barra lateral tem a largura do token, é clara (--surface) e não escura, e fica presa ao rolar", () => {
    const side = body(appMenu, ".app-menu");
    expect(side).toMatch(/width:\s*var\(--sidebar-w\)/);
    expect(side).toMatch(/background:\s*var\(--surface\)/);
    expect(side).toMatch(/border-right:\s*1px solid var\(--line\)/);
    expect(side).toMatch(/position:\s*sticky/);
    expect(side).not.toMatch(/(?<![-\w])width:\s*\d+px/);
  });

  it("o item ativo vem de aria-current e usa o tom de marca; hover só com ponteiro fino", () => {
    expect(body(appMenu, '.app-menu__link[aria-current="page"]')).toMatch(/background:\s*var\(--brand-tint\)/);
    expect(body(appMenu, '.app-menu__link[aria-current="page"]')).toMatch(/color:\s*var\(--brand-strong\)/);
    expect(appMenu).toMatch(/@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.app-menu__link:hover/);
  });

  it("a casca não usa cor literal: só tokens (nem hex, nem rgb, nem escuro fixo)", () => {
    for (const css of [appMenu, admin]) {
      expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });

  it("o contêiner do conteúdo usa --container-max e o respiro por --s-*, com o gutter do contêiner no celular", () => {
    const content = body(admin, ".fb-admin-content");
    expect(content).toMatch(/max-width:\s*var\(--container-max\)/);
    expect(content).toMatch(/--fb-admin-pad-y:\s*var\(--s-\d+\)/);
    expect(content).toMatch(/--fb-admin-pad-x:\s*var\(--s-\d+\)/);
    expect(content).not.toMatch(/padding:[^;]*\d+px/);
    expect(responsive).toMatch(/--fb-admin-pad-x:\s*var\(--container-gutter\)/);
  });

  it("o título de tela (.fb-ui-pagehead__title) segue a escala de tipografia", () => {
    const title = body(components, ".fb-ui-pagehead__title");
    expect(title).toMatch(/font-size:\s*var\(--text-h1\)/);
    expect(title).toMatch(/letter-spacing:\s*var\(--tracking-title\)/);
  });

  it("celular: a barra lateral some, o cabeçalho mostra marca e Menu, a casca vira coluna e a tabela rola na moldura", () => {
    const mobile = admin.match(/@media \(max-width: 767px\)\s*\{\s*\.fb-admin-shell\s*\{[\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(mobile).toMatch(/\.fb-admin-shell\s*\{\s*flex-direction:\s*column/);
    expect(mobile).toMatch(/\.fb-admin__menu-button\s*\{\s*display:\s*inline-flex/);
    expect(mobile).toMatch(/\.fb-admin__brand--top\s*\{\s*display:\s*inline-flex/);
    expect(appMenu).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.app-menu\s*\{\s*display:\s*none/);
    expect(body(components, ".fb-ui-table-wrap")).toMatch(/overflow-x:\s*auto/);
    expect(body(admin, ".fb-admin__body")).toMatch(/min-width:\s*0/);
    expect(body(admin, ".fb-admin-content")).toMatch(/min-width:\s*0/);
  });

  it("itens do menu com alvo de toque de 44px (--s-11) no celular", () => {
    expect(appMenu).toMatch(/\.app-menu__link\s*\{\s*min-height:\s*var\(--s-11\)/);
  });

  it("a gaveta é o Dialog compartilhado (variante drawer), não um painel próprio", () => {
    expect(components).toMatch(/\.fb-ui-dialog--drawer/);
    expect(appMenu).not.toMatch(/app-menu--open|app-menu__scrim|app-topbar/);
  });
});
