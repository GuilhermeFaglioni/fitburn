import { describe, expect, it } from "vitest";
import { copy } from "../src/content/copy";
import { faq } from "../src/content/faq";
import { distExists, page, readDist } from "./helpers";

const root = page();
const html = readDist("index.html");

describe("estrutura da landing", () => {
  it("gera dist/index.html em pt-BR e tema escuro", () => {
    expect(distExists()).toBe(true);
    const h = root.querySelector("html")!;
    expect(h.getAttribute("lang")).toBe("pt-BR");
    expect(h.getAttribute("data-theme")).toBe("dark");
  });

  it("tem exatamente um h1 com o texto do L14", () => {
    const h1 = root.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0]!.text.replace(/\s+/g, " ").trim()).toBe(
      "Chega de treinar sozinho. Musculação com 1 professor para cada 4 alunos, no Silveira.",
    );
  });

  it("mantém a ordem dos h2 da 5.4 à 5.11", () => {
    const h2 = root.querySelectorAll("h2").map((e) => e.text.trim());
    expect(h2).toEqual([
      "Não é promessa. É estrutura.",
      "Três passos até o seu primeiro treino.",
      "Do treino completo ao treino expresso.",
      "O seu treino não fica sozinho.",
      "Treinar bem começa no ambiente.",
      "Seu plano é montado na conversa.",
      "Perguntas frequentes.",
      "Sua primeira aula é por nossa conta.",
    ]);
  });

  it("não salta nível de título", () => {
    const levels = root.querySelectorAll("h1,h2,h3,h4,h5,h6").map((e) => Number(e.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
  });

  it("tem as âncoras de navegação", () => {
    for (const id of ["inicio", "conteudo", "como-funciona", "modalidades", "estrutura", "duvidas", "contato"]) {
      expect(root.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it("o skip link é o primeiro elemento focável e aponta para o main", () => {
    const first = root.querySelector("body a, body button, body input")!;
    expect(first.getAttribute("class")).toContain("skip-link");
    expect(first.getAttribute("href")).toBe("#conteudo");
    expect(root.querySelector("main")!.getAttribute("id")).toBe("conteudo");
  });

  it("traz os textos-chave da seção 5 literalmente", () => {
    const text = root.text.replace(/\s+/g, " ");
    const keys = [
      ...copy.differentials.items.flatMap((i) => [i.title, i.text]),
      ...copy.how.steps.flatMap((i) => [i.title, i.text]),
      ...copy.modalities.items.flatMap((i) => [i.name, i.tag, i.text]),
      ...copy.plans.items,
      copy.differentials.closing,
      copy.hero.lead,
    ];
    for (const k of keys) expect(text, k).toContain(k);
  });

  it("não contém texto proibido", () => {
    const banned = [
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
    // "escolha o melhor horário para você" (FAQ 1, texto fixo da spec) não é superlativo de marca.
    const text = html.replaceAll("escolha o melhor horário", "escolha um horário");
    for (const b of banned) expect(text, b).not.toContain(b);
  });

  it("renderiza as 7 dúvidas", () => {
    expect(root.querySelectorAll("details")).toHaveLength(faq.length);
  });
});
