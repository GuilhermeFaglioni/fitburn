import { describe, expect, it } from "vitest";
import { page, readDist } from "./helpers";

const root = page();

describe("acessibilidade estática", () => {
  it("imagens têm alt, dimensões e carregamento certo; nenhum alt cita Fitburn", () => {
    const imgs = root.querySelectorAll("img");
    for (const img of imgs) {
      const alt = img.getAttribute("alt");
      if (alt === "") expect(img.getAttribute("aria-hidden")).toBe("true");
      else expect(alt).toBeTruthy();
      expect(img.getAttribute("alt") ?? "").not.toMatch(/fitburn/i);
      expect(img.getAttribute("width")).toBeTruthy();
      expect(img.getAttribute("height")).toBeTruthy();
      const hero = img.getAttribute("fetchpriority") === "high";
      expect(img.getAttribute("loading")).toBe(hero ? "eager" : "lazy");
    }
    expect(imgs.filter((i) => i.getAttribute("fetchpriority") === "high").length).toBeLessThanOrEqual(1);
  });

  it("os slots de foto têm descrição que não cita Fitburn", () => {
    for (const p of root.querySelectorAll(".photo")) {
      expect(p.getAttribute("aria-label")).toBeTruthy();
      expect(p.getAttribute("aria-label")).not.toMatch(/fitburn/i);
    }
  });

  it("todo svg é decorativo ou rotulado", () => {
    for (const s of root.querySelectorAll("svg")) expect(s.getAttribute("aria-hidden")).toBe("true");
  });

  it("todo link só com ícone tem aria-label", () => {
    for (const a of root.querySelectorAll("a")) {
      if (a.text.trim() === "") expect(a.getAttribute("aria-label"), a.outerHTML).toBeTruthy();
    }
  });

  it("não há atributo style (CSP style-src 'self')", () => {
    expect(readDist("index.html")).not.toMatch(/\sstyle=/);
  });

  it("há 7 details com summary", () => {
    const d = root.querySelectorAll("details");
    expect(d).toHaveLength(7);
    for (const x of d) expect(x.querySelector("summary h3")).not.toBeNull();
  });

  it("o item 1:4 tem leitura acessível", () => {
    const li = root.querySelectorAll(".facts li")[0]!;
    expect(li.getAttribute("aria-label")).toBe("1 professor para cada 4 alunos");
  });

  it("a barra fixa é uma nav rotulada", () => {
    expect(root.querySelector('nav[aria-label="Ações rápidas"]')).not.toBeNull();
  });
});
