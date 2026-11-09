import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Navegação e layout (DS5, seção 5 do fluxo). Lê o CSS do disco.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const tokens = read("styles/tokens.css");
const global = read("styles/global.css");
const client = read("styles/client.css");
const admin = read("styles/admin.css");
const appMenu = read("components/AppMenu.css");
const responsive = read("styles/responsive.css");
const components = read("styles/components.css");

describe("espaçamento e container", () => {
  it("escala de espaçamento base 4, de --s-1 (4px) a --s-24 (96px)", () => {
    for (let i = 1; i <= 24; i++) {
      expect(tokens, `--s-${i}`).toContain(`--s-${i}: ${i * 4}px;`);
    }
  });

  it("o container usa a largura máxima e o respiro lateral por token", () => {
    const body = global.match(/\.fb-container\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/max-width:\s*var\(--container-max\)/);
    expect(body).toMatch(/padding-inline:\s*var\(--container-gutter\)/);
    expect(body).not.toMatch(/padding(-inline)?:\s*\d/);
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
    const body = admin.match(/\.fb-table-wrap\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/overflow:\s*auto/);
  });

  it("linhas da tabela têm destaque ao passar o mouse", () => {
    expect(admin).toMatch(/\.fb-table-wrap tbody tr:hover > td/);
  });

  it("o diálogo usa o raio da marca e a sombra de diálogo (--sh-3)", () => {
    const body = admin.match(/\.fb-modal\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/box-shadow:\s*var\(--sh-3\)/);
    expect(admin).toMatch(/\.fb-modal\b[^{]*\{[^}]*border-radius:\s*var\(--radius-sm\)/);
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
    const shell = admin.slice(admin.indexOf(".fb-admin-shell"), admin.indexOf(".fb-page-eyebrow"));
    for (const css of [appMenu, shell]) {
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

  it("o título de tela (.fb-page-title) segue a escala de tipografia", () => {
    const title = body(admin, ".fb-page-title");
    expect(title).toMatch(/font-size:\s*var\(--text-h1\)/);
    expect(title).toMatch(/letter-spacing:\s*var\(--tracking-title\)/);
  });

  it("celular: a barra lateral some, o cabeçalho mostra marca e Menu, a casca vira coluna e a tabela rola na moldura", () => {
    const mobile = admin.match(/@media \(max-width: 767px\)\s*\{\s*\.fb-admin-shell\s*\{[\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(mobile).toMatch(/\.fb-admin-shell\s*\{\s*flex-direction:\s*column/);
    expect(mobile).toMatch(/\.fb-admin__menu-button\s*\{\s*display:\s*inline-flex/);
    expect(mobile).toMatch(/\.fb-admin__brand--top\s*\{\s*display:\s*inline-flex/);
    expect(appMenu).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.app-menu\s*\{\s*display:\s*none/);
    expect(body(admin, ".fb-table-wrap")).toMatch(/overflow:\s*auto/);
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
