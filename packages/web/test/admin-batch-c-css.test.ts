import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lote C do admin (#156, PR 15): Minhas aulas, Presença e Presença por aluno não têm cor, raio nem fonte literal (tokens
 * só), nenhum estilo inline e nenhuma volta às classes antigas (`fb-att*`, `fb-myclass*`, `fb-seg-btn`, `fb-back-btn`,
 * abas e selos antigos). Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCREENS = [
  "src/pages/MyClassesPage.tsx",
  "src/pages/AttendancePage.tsx",
  "src/pages/ClassStudentSheetPage.tsx",
];

describe("telas do lote C: nada literal no TSX", () => {
  it.each(SCREENS)("%s não tem cor literal (hex, rgb, hsl) nem estilo inline", (path) => {
    const source = code(read(path));

    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source.match(/\bstyle=\{/g) ?? []).toEqual([]);
  });

  it("Presença não tem branco translúcido em lugar nenhum (nem o ícone de informação)", () => {
    expect(read("src/pages/AttendancePage.tsx")).not.toMatch(/rgba\(255/);
    expect(read("src/pages/AttendancePage.tsx")).toMatch(/stroke="currentColor"/);
  });

  it.each(SCREENS)("%s não usa as classes antigas nem os estados e abas antigos", (path) => {
    const source = code(read(path));

    expect(source).not.toMatch(
      /fb-(att|att__\w+|myclass\w*|seg-btn\w*|back-btn|tab-btn|tabs|page-header|page-title|page-eyebrow|badge\w*|state\w*)\b/,
    );
    expect(source).not.toMatch(/components\/states"/);
    expect(source).not.toMatch(/surface="(dark|light)"/);
  });
});

describe("CSS das telas do lote C: só tokens", () => {
  const raw = read("src/styles/components.css");
  const start = raw.indexOf("Telas do admin (issue 156, PR 15)");
  const section = start >= 0 ? code(raw.slice(start)) : "";

  it("a seção existe e traz Minhas aulas e a Presença", () => {
    expect(section).toContain(".fb-ui-mc");
    expect(section).toContain(".fb-ui-att__mark");
  });

  it("sem cor literal, sem fonte em px e raio só por token", () => {
    expect(section.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(section.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(section.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
    for (const [, value] of section.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value.trim()).toMatch(/^(var\(--r-(xs|sm|md|lg|xl|pill)\)|50%)$/);
    }
  });

  it("Presente e Faltou, o nome com link para a ficha e o voltar têm alvo de 44px", () => {
    expect(section).toMatch(/\.fb-ui-att__mark\s*\{[^}]*min-height:\s*var\(--s-11\)/);
    expect(section).toMatch(/\.fb-ui-att__name--link\s*\{[^}]*min-height:\s*var\(--s-11\)/);
    // O voltar é o Button da base com a variante de ícone (44px, definida no lote B).
    expect(raw).toMatch(/\.fb-ui-btn\.fb-ui-btn--icon\s*\{[^}]*min-height:\s*var\(--s-11\)/);
  });

  it("Presente marcado usa o verde de sucesso e Faltou o vermelho de erro, ambos com texto", () => {
    expect(section).toMatch(
      /\.fb-ui-att__mark\[aria-pressed="true"\]\.fb-ui-att__mark--present\s*\{[^}]*background:\s*var\(--success-bg\)[^}]*color:\s*var\(--success\)/,
    );
    expect(section).toMatch(
      /\.fb-ui-att__mark\[aria-pressed="true"\]\.fb-ui-att__mark--absent\s*\{[^}]*background:\s*var\(--danger-bg\)[^}]*color:\s*var\(--danger\)/,
    );
  });

  it("o hover só vale com ponteiro e o esmaecido é só de botão desabilitado e desmarcado", () => {
    expect(section).toMatch(/@media \(hover: hover\)\s*\{\s*\.fb-ui-att__mark:hover/);
    expect(section).toMatch(
      /\.fb-ui-att__mark:disabled:not\(\[aria-pressed="true"\]\)\s*\{[^}]*opacity:\s*0\.45/,
    );
  });

  it("no celular a ação da aula ocupa a linha toda (alvo largo) e a coluna respeita o gutter", () => {
    const mobile = section.slice(section.indexOf("@media (max-width: 767px)"));

    expect(mobile).toMatch(/\.fb-ui-mc__action\s*\{[^}]*flex:\s*1 1 100%/);
    expect(mobile).toMatch(/\.fb-ui-att\s*\{[^}]*var\(--container-gutter\)/);
  });

  it("o cabeçalho deixa livre o espaço do botão de tema fixo no canto", () => {
    expect(section).toMatch(/\.fb-ui-att__head\s*\{[^}]*padding-right:\s*var\(--s-13\)/);
  });
});

describe("CSS legado de Presença e Minhas aulas saiu", () => {
  it("attendance.css não existe mais e o main não o importa", () => {
    expect(existsSync(join(root, "src/styles/attendance.css"))).toBe(false);
    expect(read("src/main.tsx")).not.toContain("attendance.css");
  });

  const css = ["src/styles/client.css", "src/styles/global.css", "src/styles/responsive.css", "src/styles/components.css"]
    .map((path) => code(read(path)))
    .join("\n");

  it.each([".fb-att", ".fb-myclass", ".fb-seg-btn", ".fb-back-btn"])("%s não existe mais", (selector) => {
    expect(css).not.toMatch(new RegExp(`${selector.replace(".", "\\.")}(?![\\w-])`));
  });
});
