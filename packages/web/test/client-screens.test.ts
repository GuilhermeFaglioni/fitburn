import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Telas do cliente (DS6, decisão 134 e seção 5 do fluxo): Home, Agenda, detalhe da aula e Login.
 * Lê o CSS e o TSX do disco.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const login = read("pages/LoginPage.tsx");
const loginCss = read("pages/LoginPage.css");
const homeCss = read("styles/home.css");
const clientLayout = read("components/ClientLayout.tsx");
const clientNavIcons = read("components/icons/ClientNavIcons.tsx");
const flameMark = read("components/icons/FlameMark.tsx");
const homeTsx = [
  read("pages/ClientHomePage.tsx"),
  read("pages/home/HomeReservations.tsx"),
  read("pages/home/HomeBlockState.tsx"),
].join("\n");

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\(/g;

describe("login: erro ligado ao campo", () => {
  it("os dois campos marcam aria-invalid e apontam para a mensagem com aria-describedby", () => {
    const invalid = login.match(/aria-invalid=\{showError \|\| undefined\}/g) ?? [];
    const described = login.match(/aria-describedby=\{showError \? errorId : undefined\}/g) ?? [];
    expect(invalid.length).toBe(2);
    expect(described.length).toBe(2);
    expect(login).toMatch(/id=\{errorId\}\s+role="alert"/);
  });

  it("o ícone do erro usa a cor de erro do tema, sem hex no TSX", () => {
    expect(login).not.toMatch(/stroke="#/);
    expect(loginCss).toMatch(/\.login-form__error-icon\s*\{[^}]*color:\s*var\(--color-danger\)/);
  });
});

describe("cores das telas do cliente", () => {
  it("home.css e LoginPage.css não têm cor hex literal", () => {
    expect(homeCss.match(HEX) ?? []).toEqual([]);
    expect(loginCss.match(HEX) ?? []).toEqual([]);
  });

  it("home.css não tem rgba/hsla literal nem usa os --color-* legados: só tokens da base", () => {
    expect(homeCss.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(homeCss).not.toMatch(/var\(--color-(?!on-orange)/);
    expect(homeCss).not.toMatch(/var\(--radius-/);
  });

  it("a casca e a Home do cliente (TSX) não têm cor literal: ícones usam currentColor", () => {
    for (const source of [clientLayout, clientNavIcons, flameMark, homeTsx]) {
      expect(source.match(HEX) ?? []).toEqual([]);
      expect(source.match(COLOR_FUNCTION) ?? []).toEqual([]);
    }
    expect(clientLayout).not.toMatch(/\bACTIVE\b|\bINACTIVE\b/);
    expect(clientNavIcons).not.toMatch(/stroke="/);
  });

  it("os estados da Home vêm dos componentes compartilhados de ui/States, sem a prop surface", () => {
    expect(homeTsx).toContain("components/ui/States");
    expect(homeTsx).not.toMatch(/surface=/);
  });
});
