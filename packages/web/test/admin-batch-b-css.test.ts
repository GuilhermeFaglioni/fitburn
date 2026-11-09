import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lote B do admin (#156, PR 14): Agenda administrativa, Templates e modalidades e Reservas administrativas não têm
 * cor, raio nem fonte literal (tokens só), nenhum estilo inline e nenhuma volta às classes antigas de tabela, botão,
 * modal e aviso. Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCREENS = [
  "src/pages/AgendaAdminPage.tsx",
  "src/pages/agenda/OccurrenceFormModal.tsx",
  "src/pages/agenda/OccurrenceEditModal.tsx",
  "src/pages/agenda/OccurrenceErrorBox.tsx",
  "src/pages/TemplatesModalidadesPage.tsx",
  "src/pages/catalog/ClassTemplatesTab.tsx",
  "src/pages/catalog/ClassTemplateForm.tsx",
  "src/pages/catalog/ModalitiesTab.tsx",
  "src/pages/catalog/ModalityForm.tsx",
  "src/pages/ReservasAdminPage.tsx",
  "src/pages/reservations-admin/ReservationFormModal.tsx",
  "src/components/ExportCsvButton.tsx",
  "src/components/DeleteRowButton.tsx",
];

describe("telas do lote B: nada literal no TSX", () => {
  it.each(SCREENS)("%s não tem cor literal (hex, rgb, hsl) nem estilo inline", (path) => {
    const source = code(read(path));

    expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(source.match(/\bstyle=\{/g) ?? []).toEqual([]);
  });

  it("o #333333 do rótulo 'Dias da semana' (1,39:1 no escuro) saiu da Nova aula", () => {
    const source = read("src/pages/agenda/OccurrenceFormModal.tsx");

    expect(source).not.toMatch(/#333333/i);
    expect(source).toMatch(/fb-ui-field__label/);
  });

  it.each(SCREENS)("%s não usa as classes antigas de tabela, botão, campo, modal e aviso", (path) => {
    const source = code(read(path));

    expect(source).not.toMatch(
      /fb-(table-wrap|th|td|row-btn|btn-primary|btn-secondary|btn-danger|btn-danger-text|field|modal|tab-btn|tabs|toolbar|page-title|page-header|page-eyebrow|error-box|success-box|lock-banner|week-grid|day-col|day-head|day-empty|chip-cls|icon-btn|weekday-toggle|recurrence-summary|client-highlight|export-hint|visually-hidden|blocked-popover|badge|form)\b/,
    );
    expect(source).not.toMatch(/components\/Modal"/);
    expect(source).not.toMatch(/components\/states"/);
  });
});

describe("CSS das telas do lote B: só tokens", () => {
  const raw = read("src/styles/components.css");
  const start = raw.indexOf("Telas do admin (issue 156, PR 14)");
  const section = start >= 0 ? code(raw.slice(start)) : "";

  it("a seção existe e traz a grade da semana e a lista do celular", () => {
    expect(section).toContain(".fb-ui-wk");
    expect(section).toContain(".fb-ui-occ");
  });

  it("sem cor literal, sem fonte em px e raio só por token", () => {
    expect(section.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(section.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(section.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
    for (const [, value] of section.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(value.trim()).toMatch(/^var\(--r-(xs|sm|md|lg|xl|pill)\)$/);
    }
  });

  it("a grade do desktop tem 7 colunas e a rolagem horizontal fica na moldura da grade", () => {
    expect(section).toMatch(/\.fb-ui-wk\s*\{[^}]*grid-template-columns:\s*repeat\(7,/);
    expect(section).toMatch(/\.fb-ui-wk-scroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("no celular a grade vira uma lista por dia, sem rolagem, e o texto 'Sem aulas' aparece", () => {
    const mobile = section.slice(section.indexOf("@media (max-width: 767px)"));

    expect(mobile).toMatch(/\.fb-ui-wk\s*\{[^}]*flex-direction:\s*column/);
    expect(mobile).toMatch(/\.fb-ui-wk\s*\{[^}]*min-width:\s*0/);
    expect(mobile).toMatch(/\.fb-ui-wk-scroll\s*\{[^}]*overflow:\s*visible/);
    expect(mobile).toMatch(/\.fb-ui-wk__none\s*\{[^}]*display:\s*block/);
  });

  it("aulas, navegação da semana e dias da recorrência têm alvo de 44px", () => {
    expect(section).toMatch(/\.fb-ui-occ\s*\{[^}]*min-height:\s*var\(--s-11\)/);
    expect(section).toMatch(/\.fb-ui-btn\.fb-ui-btn--icon\s*\{[^}]*min-height:\s*var\(--s-11\)/);
    expect(section).toMatch(/\.fb-ui-weekdays \.fb-ui-pill\s*\{[^}]*height:\s*var\(--s-11\)/);
    expect(section).toMatch(/\.fb-ui-wk__add\s*\{[^}]*min-height:\s*var\(--s-11\)/);
  });

  it("o hover só vale com ponteiro e o '+' de nova aula não depende do hover no celular", () => {
    expect(section).toMatch(/@media \(hover: hover\)\s*\{\s*\.fb-ui-wk__day:hover \.fb-ui-wk__add/);
    const mobile = section.slice(section.indexOf("@media (max-width: 767px)"));
    expect(mobile).toMatch(/\.fb-ui-wk__add\s*\{[^}]*opacity:\s*1/);
  });
});

describe("CSS legado da agenda administrativa saiu", () => {
  const css = ["src/styles/admin.css", "src/styles/responsive.css", "src/styles/global.css"]
    .map((path) => code(read(path)))
    .join("\n");

  it.each([
    ".fb-week-grid",
    ".fb-day-col",
    ".fb-day-head",
    ".fb-day-empty",
    ".fb-chip-cls",
    ".fb-weekday-toggle",
    ".fb-recurrence-summary",
    ".fb-client-highlight",
    ".fb-success-box",
    ".fb-error-box",
  ])("%s não existe mais", (selector) => {
    expect(css).not.toContain(selector);
  });
});
