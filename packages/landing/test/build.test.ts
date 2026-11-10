import { describe, expect, it } from "vitest";
import { amenities, differentials, faqSection, hero, howItWorks, modalities, healthTeam, plans, visit } from "../src/content/copy";
import { stripEmphasis } from "../src/lib/emphasis";
import { page, readDist, textOf } from "./helpers";

const FORBIDDEN = [
  "10 anos",
  "Fitburn Zone",
  "R$",
  "mais completo",
  "o melhor",
  "garantid",
  "Clique aqui",
  "Saiba mais",
  "Laguna",
  "seo Muniz",
  "Link112",
  "nachegada",
  "emcadasessão",
  "massageme",
];

describe("estrutura da página", () => {
  const root = page();

  it("é pt-BR e só escuro", () => {
    const html = root.querySelector("html");
    expect(html?.getAttribute("lang")).toBe("pt-BR");
    expect(html?.getAttribute("data-theme")).toBe("dark");
  });

  it("tem exatamente um H1, com o texto do L14", () => {
    const h1 = root.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(textOf(h1[0])).toBe(
      "Chega de treinar sozinho. Musculação com 1 professor para cada 4 alunos, no Silveira.",
    );
    expect(h1[0].querySelectorAll("em").map(textOf)).toEqual(["4 alunos"]);
  });

  it("os H2 seguem a ordem das seções 5.4 a 5.11", () => {
    const titles = root.querySelectorAll("h2").map(textOf);
    expect(titles).toEqual(
      [
        differentials.title,
        howItWorks.title,
        modalities.title,
        healthTeam.title,
        amenities.title,
        plans.title,
        faqSection.title,
        visit.title,
      ].map(stripEmphasis),
    );
  });

  it("não pula nível de título", () => {
    const levels = root.querySelectorAll("h1, h2, h3, h4, h5, h6").map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((level, i) => {
      expect(level - levels[i]).toBeLessThanOrEqual(1);
    });
  });

  it("tem as âncoras de navegação", () => {
    for (const id of ["inicio", "conteudo", "como-funciona", "modalidades", "estrutura", "duvidas", "contato"]) {
      expect(root.querySelector(`#${id}`), `#${id}`).not.toBeNull();
    }
    expect(root.querySelector("main")?.getAttribute("id")).toBe("conteudo");
  });

  it("o skip link é o primeiro elemento focável e aponta para o main", () => {
    const first = root.querySelector("body a, body button, body input, body summary");
    expect(first?.getAttribute("class")).toContain("skip-link");
    expect(first?.getAttribute("href")).toBe("#conteudo");
    expect(textOf(first!)).toBe("Pular para o conteúdo");
  });

  it("a navegação do cabeçalho aponta só para âncoras que existem", () => {
    const links = root.querySelectorAll("header nav a").map((a) => a.getAttribute("href") ?? "");
    expect(links).toEqual(["#como-funciona", "#modalidades", "#estrutura", "#duvidas", "#contato"]);
    for (const href of links) expect(root.querySelector(href)).not.toBeNull();
  });
});

describe("textos da seção 5", () => {
  const text = textOf(page());

  it("mostra o herói, os fatos e o fechamento", () => {
    expect(text).toContain(hero.kicker);
    expect(text).toContain(hero.lead);
    expect(text).toContain(hero.support);
    expect(text).toContain(differentials.closing);
    for (const caption of ["1:4", "400", "5h30"]) expect(text).toContain(caption);
  });

  it("mostra os 4 diferenciais, os 3 passos, as 2 modalidades e os 5 itens do plano anual", () => {
    for (const item of differentials.items) {
      expect(text).toContain(item.title);
      expect(text).toContain(item.text);
    }
    for (const step of howItWorks.steps) {
      expect(text).toContain(step.title);
      expect(text).toContain(step.text);
    }
    for (const item of modalities.items) {
      expect(text).toContain(item.name);
      expect(text).toContain(item.tag);
      expect(text).toContain(item.text);
    }
    for (const benefit of plans.benefits) expect(text).toContain(benefit);
    expect(plans.benefits).toHaveLength(5);
    expect(text).toContain(plans.subtitle);
  });

  it("mostra a equipe de saúde, a estrutura e o contato", () => {
    for (const item of healthTeam.items) expect(text).toContain(item.text);
    for (const item of amenities.items) expect(text).toContain(item.label);
    expect(text).toContain("Rua Ilacir Pereira Lima, 166, Loja 04");
    expect(text).toContain("CEP 31140-540");
    expect(text).toContain("© 2026 Fitburn Brasil");
  });

  it("não tem nenhum texto proibido (regras de copy e itens fora da página)", () => {
    for (const file of ["index.html", "404.html"]) {
      // "o melhor horário" está no texto final da pergunta 1 do FAQ (seção 5.10); é o único uso permitido de "o melhor".
      const html = readDist(file).replaceAll("o melhor horário", "");
      for (const word of FORBIDDEN) expect(html.includes(word), `"${word}" em ${file}`).toBe(false);
    }
  });

  it("não promete resultado nem usa exclamação no conteúdo visível", () => {
    const body = textOf(page().querySelector("body")!);
    expect(body).not.toContain("!");
  });
});
