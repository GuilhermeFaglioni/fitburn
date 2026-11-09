import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lote E do admin (#156, PR 17): Fichas de treino e Metas não têm cor, raio nem fonte literal (tokens só), nenhum estilo
 * inline nas telas e nenhuma volta às classes antigas (`fb-sheets*`, `fb-goals*`, campos, botões, avisos e estados
 * antigos). A coluna de alunos usa o token aprovado `--list-w`. Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCREENS = [
  "src/pages/WorkoutSheetsPage.tsx",
  "src/pages/workout-sheets/SheetEditor.tsx",
  "src/pages/GoalsPage.tsx",
  "src/pages/goals/GoalCard.tsx",
  "src/pages/goals/GoalForm.tsx",
  "src/pages/goals/GoalConfirmDialog.tsx",
  "src/pages/goals/StudentList.tsx",
  "src/components/HealthDataNotice.tsx",
  "src/components/ui/ActionMenu.tsx",
  "src/components/ui/Textarea.tsx",
];

describe("telas do lote E: nada literal no TSX", () => {
  it.each(SCREENS)("%s não tem cor literal (hex, rgb, hsl) nem estilo inline", (path) => {
    const source = code(read(path));

    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source.match(/\bstyle=\{/g) ?? []).toEqual([]);
  });

  it.each(SCREENS)("%s não usa as classes, os estados nem o modal antigos", (path) => {
    const source = code(read(path));

    expect(source).not.toMatch(
      /fb-(sheets\w*|goals\w*|tab-btn|tabs|th|td\w*|table-wrap|badge\w*|field|modal\w*|btn-\w+|row-btn|row--inactive|lock-banner\w*|note|page-title|page-eyebrow|state\w*)\b/,
    );
    expect(source).not.toMatch(/components\/(states|Modal)"/);
    expect(source).not.toMatch(/surface="(dark|light)"/);
  });

  it("as telas usam os componentes da base", () => {
    const sheets = ["src/pages/WorkoutSheetsPage.tsx", "src/pages/workout-sheets/SheetEditor.tsx"]
      .map(read)
      .join("\n");
    for (const component of [
      "ui/Alert",
      "ui/Badge",
      "ui/Button",
      "ui/Card",
      "ui/Dialog",
      "ui/Field",
      "ui/PageHeader",
      "ui/Select",
      "ui/States",
      "ui/Table",
    ]) {
      expect(sheets).toContain(`components/${component}`);
    }
    expect(sheets).toContain("QueryBlockState");

    const goals = [
      "src/pages/GoalsPage.tsx",
      "src/pages/goals/GoalCard.tsx",
      "src/pages/goals/GoalForm.tsx",
      "src/pages/goals/GoalConfirmDialog.tsx",
      "src/pages/goals/StudentList.tsx",
    ]
      .map(read)
      .join("\n");
    for (const component of [
      "ui/ActionMenu",
      "ui/Badge",
      "ui/Button",
      "ui/Card",
      "ui/Dialog",
      "ui/Field",
      "ui/PageHeader",
      "ui/States",
    ]) {
      expect(goals).toContain(`components/${component}`);
    }
    expect(goals).toContain("QueryBlockState");
  });

  it("Metas não desenha barra de progresso (a API não tem valor alvo nem progresso)", () => {
    const goals = ["src/pages/GoalsPage.tsx", "src/pages/goals/GoalCard.tsx"].map(read).join("\n");

    expect(goals).not.toContain("ui/Meter");
    expect(goals).not.toMatch(/progressbar|<Meter/);
  });
});

describe("CSS das telas do lote E: só tokens", () => {
  const raw = read("src/styles/components.css");
  const start = raw.indexOf("Telas do admin (issue 156, PR 17)");
  const section = start >= 0 ? code(raw.slice(start)) : "";

  it("a seção existe e traz a lista + detalhe, o editor, as metas e o menu", () => {
    for (const selector of [
      ".fb-ui-master",
      ".fb-ui-students",
      ".fb-ui-ex",
      ".fb-ui-goal",
      ".fb-ui-menu__popover",
    ]) {
      expect(section).toContain(selector);
    }
  });

  it("sem cor literal, sem fonte em px e raio só por token", () => {
    expect(section.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(section.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(section.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
    expect(section).not.toMatch(/var\(--color-/);
    for (const [, value] of section.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value.trim()).toMatch(/^var\(--r-(xs|sm|md|lg|xl|pill)\)$/);
    }
  });

  it("a coluna de alunos tem a largura do token aprovado --list-w (260px), no desktop", () => {
    expect(read("src/styles/tokens.css")).toMatch(/--list-w:\s*260px/);
    expect(section).toMatch(
      /@media \(min-width: 1024px\)\s*\{\s*\.fb-ui-master\s*\{[^}]*grid-template-columns:\s*var\(--list-w\) minmax\(0, 1fr\)/,
    );
    expect(section).not.toMatch(/(?<![-\w])(width|grid-template-columns):[^;]*\b260px/);
  });

  it("no celular a lista vira uma faixa acima do detalhe e nada força rolagem horizontal da página", () => {
    expect(section).toMatch(
      /\.fb-ui-master\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(section).toMatch(/\.fb-ui-master__detail\s*\{[^}]*min-width:\s*0/);
    // Campos do exercício: colunas que quebram sozinhas, nunca uma largura fixa.
    expect(section).toMatch(
      /\.fb-ui-ex__fields\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 120px\), 1fr\)\)/,
    );
    expect(section).not.toMatch(/\.fb-ui-ex(__fields)?\s*\{[^}]*(?<![-\w])(min-)?width:\s*\d+px/);
  });

  it("os alvos de toque têm 44px: itens da lista, botão e itens do menu, botões de mover e remover", () => {
    const body = (selector: string) => {
      const found = section.match(new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
      return found?.[1] ?? "";
    };

    expect(body(".fb-ui-students__item")).toMatch(/min-height:\s*44px/);
    expect(body(".fb-ui-menu__trigger")).toMatch(/width:\s*44px/);
    expect(body(".fb-ui-menu__trigger")).toMatch(/height:\s*44px/);
    expect(body(".fb-ui-menu__item")).toMatch(/min-height:\s*44px/);
    expect(body(".fb-ui-ex__move")).toMatch(/--h:\s*44px/);
    expect(body(".fb-ui-ex__move")).toMatch(/min-width:\s*44px/);
  });

  it("o menu flutuante fica abaixo do diálogo (z-index menor que o do fundo do diálogo)", () => {
    const dialog = Number(
      raw.match(/\.fb-ui-dialog-backdrop\s*\{[^}]*z-index:\s*(\d+)/)?.[1] ?? Number.NaN,
    );
    const menu = Number(
      section.match(/\.fb-ui-menu__popover\s*\{[^}]*z-index:\s*(\d+)/)?.[1] ?? Number.NaN,
    );

    expect(menu).toBeLessThan(dialog);
  });
});

describe("CSS legado de Fichas (professor) e Metas saiu", () => {
  it("goals.css não existe mais e o main não o importa", () => {
    expect(existsSync(join(root, "src/styles/goals.css"))).toBe(false);
    expect(read("src/main.tsx")).not.toContain("goals.css");
  });

  const css = [
    "src/styles/admin.css",
    "src/styles/global.css",
    "src/styles/responsive.css",
    "src/styles/components.css",
    "src/styles/workout.css",
  ]
    .map((path) => code(read(path)))
    .join("\n");

  it.each([
    ".fb-goals",
    ".fb-sheets",
    ".fb-lock-banner",
    ".fb-btn-dashed",
    ".fb-row-btn",
    ".fb-note",
  ])("%s não existe mais", (selector) => {
    expect(css).not.toMatch(new RegExp(`${selector.replace(".", "\\.")}(?![\\w-])`));
  });

  it("workout.css guarda só a ficha do cliente, que não mudou", () => {
    expect(code(read("src/styles/workout.css"))).toContain(".fb-workout");
  });
});
