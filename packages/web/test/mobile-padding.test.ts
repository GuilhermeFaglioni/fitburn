import clientCss from "../src/styles/client.css?raw";

/**
 * Cada tela do cliente que define um padding próprio no desktop (`.fb-client__content[data-screen="x"]`) precisa
 * de um override explícito no bloco mobile (max-width: 767px), senão o padding do desktop vence o mobile base e a
 * tab bar fixa cobre o fim do conteúdo.
 */
const MOBILE_MARK = "@media (max-width: 767px) {\n  .fb-client__sidebar";
const split = clientCss.indexOf(MOBILE_MARK);
const base = clientCss.slice(0, split);
const mobile = clientCss.slice(split);

describe("padding mobile do conteúdo do cliente", () => {
  const screens = [...base.matchAll(/\.fb-client__content\[data-screen="([\w-]+)"\]\s*\{[^}]*padding:/g)].map(
    (m) => m[1],
  );

  it("encontra o bloco mobile e as telas com padding próprio", () => {
    expect(split).toBeGreaterThan(0);
    expect(screens).toEqual(expect.arrayContaining(["home", "agenda", "fitpoints"]));
  });

  it.each(screens)("a tela %s tem override mobile com respiro de 108px embaixo", (screen) => {
    const rule = new RegExp(`[^{}]*\\.fb-client__content\\[data-screen="${screen}"\\][^{]*\\{([^}]*)\\}`).exec(
      mobile,
    );
    expect(rule, `sem override mobile para ${screen}`).not.toBeNull();
    expect(rule![1]).toMatch(/padding:\s*\d+px 20px 108px/);
  });
});
