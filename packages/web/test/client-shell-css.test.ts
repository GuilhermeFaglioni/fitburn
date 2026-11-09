import clientCss from "../src/styles/client.css?raw";
import themeToggleCss from "../src/styles/theme-toggle.css?raw";

/**
 * Casca do cliente (D-038, #156): cabeçalho, lateral no desktop e barra inferior de 5 itens no celular. Lê o CSS.
 */
const MOBILE_MARK = "@media (max-width: 767px) {\n  .fb-client__sidebar";
const split = clientCss.indexOf(MOBILE_MARK);
const base = clientCss.slice(0, split);
const mobile = clientCss.slice(split);

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
}

describe("casca do cliente: tokens e sem cor literal", () => {
  it("a casca (antes das telas) não usa cor hex nem rgba literal", () => {
    const shell = clientCss.slice(0, clientCss.indexOf("/* Botão de voltar"));
    expect(shell.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(shell.match(/\b(?:rgba?|hsla?)\(/g) ?? []).toEqual([]);
    expect(shell).not.toMatch(/var\(--color-/);
  });

  it("a marca usa os tokens de marca nos dois temas (chama = --flame atrás e --brand à frente)", () => {
    expect(ruleBody(clientCss, ".fb-flame__back")).toMatch(/fill:\s*var\(--flame\)/);
    expect(ruleBody(clientCss, ".fb-flame__front")).toMatch(/fill:\s*var\(--brand\)/);
  });

  it("o item ativo da lateral usa a tinta e o texto de marca", () => {
    const active = /\.fb-client__nav-item\.active,\s*\.fb-client__nav-item\[aria-current="page"\]\s*\{([^}]*)\}/.exec(
      clientCss,
    )?.[1];
    expect(active).toMatch(/background:\s*var\(--brand-tint\)/);
    expect(active).toMatch(/color:\s*var\(--brand-strong\)/);
  });
});

describe("casca do cliente: desktop e celular", () => {
  it("no desktop a barra inferior fica escondida e a marca do cabeçalho também (está na lateral)", () => {
    expect(ruleBody(base, ".fb-client .fb-client__tabbar")).toMatch(/display:\s*none/);
    expect(ruleBody(base, ".fb-client__brand--top")).toMatch(/display:\s*none/);
  });

  it("no celular a lateral some e a barra inferior fica fixa embaixo, em grade", () => {
    expect(ruleBody(mobile, ".fb-client__sidebar")).toMatch(/display:\s*none/);
    const tabbar = ruleBody(mobile, ".fb-client .fb-client__tabbar");
    expect(tabbar).toMatch(/display:\s*grid/);
    expect(tabbar).toMatch(/position:\s*fixed/);
    expect(tabbar).toMatch(/bottom:\s*0/);
  });

  it("no celular o cabeçalho mostra a marca à esquerda e o botão de tema à direita", () => {
    expect(ruleBody(mobile, ".fb-client__brand--top")).toMatch(/display:\s*inline-flex/);
    expect(ruleBody(mobile, ".fb-client__top")).toMatch(/justify-content:\s*space-between/);
  });

  it("o botão de tema no cabeçalho não é fixo no canto", () => {
    expect(ruleBody(themeToggleCss, ".fb-theme-toggle--inline")).toMatch(/position:\s*static/);
    expect(ruleBody(themeToggleCss, ".fb-theme-toggle")).toMatch(/position:\s*fixed/);
  });
});
