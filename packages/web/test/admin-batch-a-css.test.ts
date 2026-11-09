import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lote A do admin (#156, PR 13): as telas migradas não têm cor, raio nem fonte literal (tokens só) e nenhuma delas
 * volta às classes antigas de tabela, botão e modal. Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCREENS = [
  "src/pages/ClientsPage.tsx",
  "src/pages/ClientCreatePage.tsx",
  "src/pages/ClientDetailPage.tsx",
  "src/pages/clients/ClientEditForm.tsx",
  "src/pages/UsuariosPerfisPage.tsx",
  "src/pages/UsersPage.tsx",
  "src/pages/ProfilesPage.tsx",
  "src/pages/ProfileMatrix.tsx",
  "src/pages/StaffFormModal.tsx",
  "src/pages/AssignmentsPage.tsx",
  "src/components/DeleteUserDialog.tsx",
  "src/components/ResetUserPasswordDialog.tsx",
];

describe("telas do lote A: nada literal no TSX", () => {
  it.each(SCREENS)("%s não tem cor literal (hex, rgb, hsl) nem estilo inline", (path) => {
    const source = code(read(path));

    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source.match(/\bstyle=\{/g) ?? []).toEqual([]);
  });

  it("o cinza #4a4a4a e o #5a5a5a que ficavam abaixo de 4,5:1 no escuro saíram de Atribuições", () => {
    const source = read("src/pages/AssignmentsPage.tsx");

    expect(source).not.toMatch(/#4a4a4a|#5a5a5a/i);
  });

  it.each(SCREENS)("%s não usa as classes antigas de tabela, botão, campo e modal", (path) => {
    const source = code(read(path));

    expect(source).not.toMatch(
      /fb-(table-wrap|th|td|row-btn|btn-primary|btn-secondary|btn-danger|field|modal|tab-btn|tabs|toolbar|page-title|page-header|error-box|lock-banner)\b/,
    );
    expect(source).not.toMatch(/components\/Modal"/);
  });
});

describe("CSS das telas do lote A: só tokens", () => {
  const raw = read("src/styles/components.css");
  const css = code(raw);
  const start = raw.indexOf("Telas do admin (issue 156, PR 13)");
  const section = start >= 0 ? code(raw.slice(start)) : "";

  it("a seção existe", () => {
    expect(section).toContain(".fb-ui-pagehead");
  });

  it("sem cor literal, sem fonte em px e raio só por token", () => {
    expect(section.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(section.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(section.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
    for (const [, value] of section.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value.trim()).toMatch(/^var\(--r-(xs|sm|md|lg|xl|pill)\)$/);
    }
  });

  it("no celular a grade do formulário e a lista de dados passam para uma coluna", () => {
    const mobile = section.slice(section.indexOf("@media (max-width: 767px)"));

    expect(mobile).toMatch(/\.fb-ui-form-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(mobile).toMatch(/\.fb-ui-dl__row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it("os controles da barra de filtros e os itens de perfil têm alvo de 44px", () => {
    expect(section).toMatch(/\.fb-ui-toolbar \.fb-ui-input\s*\{[^}]*min-height:\s*var\(--s-11\)/);
    expect(section).toMatch(/\.fb-ui-profile-item\s*\{[^}]*min-height:\s*var\(--s-11\)/);
  });

  it("a rolagem horizontal da matriz fica na moldura da tabela, nunca na página", () => {
    expect(section).toMatch(/\.fb-ui-table--matrix\s*\{[^}]*min-width:\s*820px/);
    expect(css).toMatch(/\.fb-ui-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  });
});
