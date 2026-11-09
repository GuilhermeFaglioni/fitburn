import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lote D do admin (#156, PR 16): Dashboard e Planos não têm cor, raio nem fonte literal (tokens só), nenhum estilo
 * inline nas telas e nenhuma volta às classes antigas (`fb-dash*`, abas, tabela, selos, campos e estados antigos).
 * Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCREENS = [
  "src/pages/DashboardPage.tsx",
  "src/pages/PlansPage.tsx",
  "src/pages/plans/CatalogTab.tsx",
  "src/pages/plans/AssignTab.tsx",
  "src/pages/plans/PlanForm.tsx",
  "src/pages/plans/PlanToggleDialog.tsx",
];

describe("telas do lote D: nada literal no TSX", () => {
  it.each(SCREENS)("%s não tem cor literal (hex, rgb, hsl) nem estilo inline", (path) => {
    const source = code(read(path));

    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source.match(/\bstyle=\{/g) ?? []).toEqual([]);
  });

  it.each(SCREENS)("%s não usa as classes, os estados nem o modal antigos", (path) => {
    const source = code(read(path));

    expect(source).not.toMatch(
      /fb-(dash\w*|tab-btn|tabs|th|td\w*|table-wrap|badge\w*|field|modal\w*|btn-\w+|row-btn|row--inactive|toolbar-end|lock-banner\w*|assign|note|page-title|page-eyebrow|state\w*)\b/,
    );
    expect(source).not.toMatch(/components\/(states|Modal)"/);
    expect(source).not.toMatch(/surface="(dark|light)"/);
  });

  it("as telas usam os componentes da base", () => {
    const dashboard = read("src/pages/DashboardPage.tsx");
    for (const component of ["ui/Card", "ui/Meter", "ui/PageHeader", "ui/States"]) {
      expect(dashboard).toContain(`components/${component}`);
    }
    expect(dashboard).toContain("QueryBlockState");

    const plans = [
      "src/pages/PlansPage.tsx",
      "src/pages/plans/CatalogTab.tsx",
      "src/pages/plans/AssignTab.tsx",
      "src/pages/plans/PlanForm.tsx",
      "src/pages/plans/PlanToggleDialog.tsx",
    ]
      .map(read)
      .join("\n");
    for (const component of [
      "ui/Badge",
      "ui/Button",
      "ui/Card",
      "ui/Dialog",
      "ui/Field",
      "ui/PageHeader",
      "ui/Segmented",
      "ui/Select",
      "ui/States",
      "ui/Table",
    ]) {
      expect(plans).toContain(`components/${component}`);
    }
    expect(plans).toContain("QueryBlockState");
  });
});

describe("CSS das telas do lote D: só tokens", () => {
  const raw = read("src/styles/components.css");
  const start = raw.indexOf("Telas do admin (issue 156, PR 16)");
  const section = start >= 0 ? code(raw.slice(start)) : "";

  it("a seção existe e traz os KPIs, o ranking e a atribuição", () => {
    expect(section).toContain(".fb-ui-kpis");
    expect(section).toContain(".fb-ui-dash-ranking");
    expect(section).toContain(".fb-ui-assign");
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

  it("no celular a barra de ocupação desce para a segunda linha e os KPIs perdem folga", () => {
    const mobile = section.slice(section.indexOf("@media (max-width: 767px)"));

    expect(mobile).toMatch(/\.fb-ui-dash-bars > li > \.fb-ui-meter\s*\{[^}]*grid-row:\s*2/);
    expect(mobile).toMatch(/\.fb-ui-kpi\s*\{[^}]*padding:\s*var\(--s-4\)/);
  });
});

describe("CSS legado do Dashboard e da atribuição saiu", () => {
  it("dashboard.css não existe mais e o main não o importa", () => {
    expect(existsSync(join(root, "src/styles/dashboard.css"))).toBe(false);
    expect(read("src/main.tsx")).not.toContain("dashboard.css");
  });

  const css = [
    "src/styles/admin.css",
    "src/styles/global.css",
    "src/styles/responsive.css",
    "src/styles/components.css",
    "src/styles/plan.css",
  ]
    .map((path) => code(read(path)))
    .join("\n");

  it.each([
    ".fb-dash",
    ".fb-assign",
    ".fb-toolbar-end",
    ".fb-lock-banner--sm",
    ".fb-plan__admin-history",
  ])("%s não existe mais", (selector) => {
    expect(css).not.toMatch(new RegExp(`${selector.replace(".", "\\.")}(?![\\w-])`));
  });
});
