import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Atalhos deslizantes do Início (N2, #201): só tokens, scroll-snap sem autoplay, reduced motion e a grade do desktop
 * intacta. Lê o código-fonte do disco, sem navegador.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const components = read("src/styles/components.css");
const home = read("src/styles/home.css");
/** Do início do comentário que abre a seção até o fim do arquivo (a seção é a última). */
const sectionFrom = (css: string, title: string) => code(css.slice(css.lastIndexOf("/*", css.indexOf(title))));
const carouselCss = sectionFrom(components, "Carrossel de atalho (N2");
const shortcutsCss = sectionFrom(home, "Atalhos deslizantes (N2");
const sources = [
  "src/components/ui/ShortcutCarousel.tsx",
  "src/pages/home/HomeShortcuts.tsx",
  "src/pages/home/HomeBodyShortcut.tsx",
  "src/pages/home/HomeShopShortcut.tsx",
].map((path) => code(read(path)));

describe("CSS dos atalhos: só tokens", () => {
  for (const [name, css] of [
    ["carrossel (components.css)", carouselCss],
    ["atalhos (home.css)", shortcutsCss],
  ] as const) {
    it(`${name}: sem cor literal, sem fonte, espaçamento ou raio em px`, () => {
      expect(css.length).toBeGreaterThan(100);
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      expect(css.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
      expect(css.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([]);
      expect(css).not.toMatch(/border-radius:\s*\d/);
      for (const [, value] of css.matchAll(/(?:padding|margin|gap)[a-z-]*:\s*([^;]+);/g)) {
        expect(value).not.toMatch(/(?<![\w.-])[1-9]\d*px\b/);
      }
    });
  }

  it("o TSX não tem cor literal nem estilo inline", () => {
    for (const source of sources) {
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      expect(source.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]);
      expect(source).not.toMatch(/\bstyle=\{/);
    }
  });
});

describe("carrossel de atalho: comportamento no CSS", () => {
  it("desliza com scroll-snap horizontal e prende cada slide no início", () => {
    expect(carouselCss).toMatch(/\.fb-ui-carousel__track\s*\{[^}]*overflow-x:\s*auto/);
    expect(carouselCss).toMatch(/\.fb-ui-carousel__track\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
    expect(carouselCss).toMatch(/\.fb-ui-carousel__slide\s*\{[^}]*scroll-snap-align:\s*start/);
  });

  it("não tem animação de troca automática", () => {
    expect(carouselCss).not.toMatch(/@keyframes|animation:/);
    expect(sources.join("\n")).not.toMatch(/setInterval|setTimeout/);
  });

  it("com reduced motion a rolagem é direta e os pontinhos não animam", () => {
    const reduced = carouselCss.slice(carouselCss.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.fb-ui-carousel__track\s*\{[^}]*scroll-behavior:\s*auto/);
    expect(reduced).toMatch(/\.fb-ui-carousel__dots i\s*\{[^}]*transition-property:\s*none/);
  });

  it("o link do rodapé tem área de toque de 44px sem crescer a linha", () => {
    expect(carouselCss).toMatch(/\.fb-ui-carousel__more::before\s*\{[^}]*inset:/);
  });
});

describe("Início: linha dos atalhos e grade do desktop", () => {
  it("os dois atalhos dividem a linha; sem a Loja, o Corpo ocupa tudo", () => {
    expect(shortcutsCss).toMatch(/\.fb-home__shortcuts\s*\{[^}]*display:\s*flex/);
    expect(shortcutsCss).toMatch(/\.fb-home__shortcuts > \*\s*\{[^}]*flex:\s*1 1 0/);
    expect(shortcutsCss).toMatch(/\.fb-home__shortcuts > \*\s*\{[^}]*min-width:\s*0/);
  });

  it("a partir de 1100px a coluna da esquerda é saudação, atalhos e FitPoints, com as aulas ao lado", () => {
    const desktop = home.slice(home.indexOf("@media (min-width: 1100px)"), home.indexOf("@media (min-width: 768px)"));
    expect(desktop).toMatch(/grid-template-columns:\s*400px minmax\(0, 1fr\)/);
    expect(desktop).toMatch(/\.fb-home > \.fb-home__shortcuts\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2/);
    expect(desktop).toMatch(/\[aria-label="Próximas aulas"\]\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1 \/ span 3/);
    expect(desktop).toMatch(/\[aria-label="FitPoints"\]\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*3/);
  });

  it("com o aviso de pedido, tudo desce uma linha e o aviso segue em largura total", () => {
    const desktop = home.slice(home.indexOf("@media (min-width: 1100px)"), home.indexOf("@media (min-width: 768px)"));
    expect(desktop).toMatch(/:has\(> \.fb-home__order-notice\)\s*\{[^}]*grid-template-rows:\s*auto auto auto 1fr/);
    expect(desktop).toMatch(/:has\(> \.fb-home__order-notice\) > \.fb-home__shortcuts\s*\{[^}]*grid-row:\s*3/);
    expect(desktop).toMatch(/:has\(> \.fb-home__order-notice\) > \[aria-label="FitPoints"\]\s*\{[^}]*grid-row:\s*4/);
    expect(desktop).toMatch(/\.fb-home__order-notice\s*\{[^}]*grid-column:\s*1 \/ -1/);
  });
});
