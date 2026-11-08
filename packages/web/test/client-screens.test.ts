import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Telas do cliente (DS6, decisão 134 e seção 5 do fluxo): Home, Agenda, detalhe da aula e Login.
 * Lê o CSS e o TSX do disco.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const login = read("pages/LoginPage.tsx");
const loginCss = read("pages/LoginPage.css");

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
    expect(read("styles/home.css").match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
    expect(loginCss.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });
});
