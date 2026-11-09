import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Componentes base compartilhados (DS4, D-038): campo, botão, badge e card são os `fb-ui-*` de components.css, só com
 * tokens. Lê o CSS do disco (o ?raw não serve para folhas importadas em main.tsx). O comportamento de cada variante
 * (erro, carregando, toque de 44px, card selecionado, tons do badge) é medido em ui-components-css.test.ts.
 */
const css = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");
const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");

describe("componentes base compartilhados", () => {
  it("são carregados antes da folha de admin, para o admin sobrescrever só o que for dele", () => {
    const shared = main.indexOf("components.css");
    expect(shared).toBeGreaterThan(-1);
    expect(shared).toBeLessThan(main.indexOf("admin.css"));
  });

  it("todas as folhas de estilo do app são importadas em main.tsx (nenhuma ficou órfã)", () => {
    for (const sheet of ["global", "components", "admin", "client", "gamification", "plan", "workout", "profile", "home", "agenda", "responsive", "connectivity", "theme-toggle"]) {
      expect(main, sheet).toContain(`./styles/${sheet}.css`);
    }
    expect(main).not.toContain("states.css");
  });

  it("não tem cor literal: só tokens", () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it("campo, botão, badge e card têm a classe base e as variantes de estado", () => {
    for (const selector of [
      ".fb-ui-input",
      '.fb-ui-input[aria-invalid="true"]',
      ".fb-ui-btn",
      '.fb-ui-btn[aria-busy="true"]',
      ".fb-ui-badge",
      ".fb-ui-card",
      ".fb-ui-card--selected",
    ]) {
      expect(css, selector).toContain(selector);
    }
  });
});
