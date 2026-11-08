import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Componentes base (DS4, seção 5 do fluxo): campo, botão, badge e card em CSS compartilhado, só com tokens.
 * Lê o CSS do disco (o ?raw não serve para folhas importadas em main.tsx).
 */
const css = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");
const admin = readFileSync(join(process.cwd(), "src/styles/admin.css"), "utf8");
const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");

describe("componentes base compartilhados", () => {
  it("são carregados antes da folha de admin, para o admin sobrescrever só o que for dele", () => {
    const shared = main.indexOf("components.css");
    expect(shared).toBeGreaterThan(-1);
    expect(shared).toBeLessThan(main.indexOf("admin.css"));
  });

  it("as regras base saíram de admin.css (sem cópia duplicada)", () => {
    expect(admin).not.toMatch(/\n\.fb-field \{/);
    expect(admin).not.toMatch(/\n\.fb-btn-primary \{/);
    expect(admin).not.toMatch(/\n\.fb-badge \{/);
  });

  it("não tem cor literal: só tokens", () => {
    expect(css.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it("campo com erro expõe aria-invalid, e o botão ocupado (aria-busy) não aceita novo clique", () => {
    expect(css).toMatch(/\.fb-field\[aria-invalid="true"\]\s*\{[^}]*--color-danger/);
    expect(css).toMatch(/\.fb-btn-primary\[aria-busy="true"\][\s\S]*?pointer-events:\s*none/);
  });

  it("o alvo de toque de 44px vale para botões e campos em telas de toque", () => {
    const coarse = css.match(/@media \(pointer: coarse\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    for (const selector of [".fb-field", ".fb-btn-primary", ".fb-btn-secondary"]) {
      expect(coarse).toContain(selector);
    }
    expect(coarse).toMatch(/min-height:\s*44px/);
  });

  it("card selecionado usa borda de 2px na cor de marca e compensa o padding", () => {
    expect(css).toMatch(/\.fb-card--selected\s*\{[^}]*border:\s*2px solid var\(--color-primary-orange\)/);
    expect(css).toMatch(/\.fb-card--selected\s*\{[^}]*padding:\s*15px/);
  });

  it("badge tem as variantes de estado", () => {
    for (const variant of [".fb-badge--active", ".fb-badge--inactive", ".fb-badge--accent", ".fb-badge--neutral"]) {
      expect(css).toContain(variant);
    }
  });
});
