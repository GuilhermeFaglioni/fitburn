import { describe, expect, it } from "vitest";
import { page, textOf } from "./helpers";

const root = page();

describe("acessibilidade estática", () => {
  it("toda <img> tem alt, width e height, e nenhum alt cita 'Fitburn'", () => {
    for (const img of root.querySelectorAll("img")) {
      const alt = img.getAttribute("alt");
      expect(alt, img.outerHTML).not.toBeNull();
      if (alt === "") expect(img.getAttribute("aria-hidden")).toBe("true");
      else expect(alt).not.toMatch(/fitburn/i);
      expect(img.getAttribute("width")).toBeTruthy();
      expect(img.getAttribute("height")).toBeTruthy();
    }
  });

  it("só a imagem do herói é eager com fetchpriority alto; as outras são lazy", () => {
    const imgs = root.querySelectorAll("img");
    const eager = imgs.filter((img) => img.getAttribute("loading") === "eager");
    expect(eager.length).toBeLessThanOrEqual(1);
    for (const img of eager) {
      expect(img.getAttribute("fetchpriority")).toBe("high");
      expect(root.querySelectorAll("#inicio img")).toContain(img);
    }
    for (const img of imgs.filter((i) => !eager.includes(i))) {
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("fetchpriority")).not.toBe("high");
    }
  });

  it("todo SVG é decorativo (aria-hidden) e todo link só com ícone tem aria-label", () => {
    for (const svg of root.querySelectorAll("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
    for (const a of root.querySelectorAll("a")) {
      if (textOf(a) === "") expect(a.getAttribute("aria-label"), a.outerHTML).toBeTruthy();
    }
  });

  it("não há atributo style= (CSP style-src 'self')", () => {
    expect(root.querySelectorAll("[style]")).toHaveLength(0);
    expect(root.querySelectorAll("style")).toHaveLength(0);
  });

  it("o FAQ tem 7 <details>, cada um com <summary> e H3", () => {
    const items = root.querySelectorAll("details");
    expect(items).toHaveLength(7);
    for (const item of items) {
      expect(item.querySelector("summary h3")).not.toBeNull();
      expect(item.hasAttribute("open")).toBe(false);
    }
    expect(root.querySelectorAll("summary")).toHaveLength(7);
  });

  it("o 1:4 tem leitura acessível e os números decorativos ficam escondidos", () => {
    const facts = root.querySelector('ul[aria-label="Fitburn em números"]');
    expect(facts?.querySelectorAll("li")).toHaveLength(4);
    expect(textOf(facts!.querySelector(".sr-only")!)).toBe("1 professor para cada 4 alunos");
    expect(facts!.querySelector(".value")?.getAttribute("aria-hidden")).toBe("true");
    for (const num of root.querySelectorAll("ol .num")) expect(num.getAttribute("aria-hidden")).toBe("true");
  });

  it("links que abrem em nova aba avisam no rótulo", () => {
    for (const a of root.querySelectorAll('a[target="_blank"]')) {
      const label = `${a.getAttribute("aria-label") ?? ""} ${textOf(a)}`;
      expect(label, a.outerHTML).toContain("abre em nova aba");
    }
  });

  it("não há script de verdade (só ld+json)", () => {
    for (const script of root.querySelectorAll("script")) {
      expect(script.getAttribute("type")).toBe("application/ld+json");
    }
  });
});
