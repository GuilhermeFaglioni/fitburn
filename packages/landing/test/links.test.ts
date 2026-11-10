import { describe, expect, it } from "vitest";
import { analyticsEvents, analyticsLocals, site } from "../src/content/site";
import { page } from "./helpers";

const ALLOWED_HOSTS = ["wa.me", "www.google.com", "www.instagram.com", "www.facebook.com", "www.youtube.com"];
const root = page();
const links = root.querySelectorAll("a[href]");

describe("links", () => {
  it("todo href externo pertence à lista permitida", () => {
    const external = links.filter((a) => /^https?:/.test(a.getAttribute("href")!));
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) {
      const url = new URL(a.getAttribute("href")!);
      expect(ALLOWED_HOSTS, a.getAttribute("href")!).toContain(url.host);
      if (url.host === "www.google.com") expect(url.pathname).toMatch(/^\/maps/);
    }
  });

  it("tel: só com o fixo da Fitburn", () => {
    const tels = links.filter((a) => a.getAttribute("href")!.startsWith("tel:"));
    expect(tels.length).toBeGreaterThan(0);
    for (const a of tels) expect(a.getAttribute("href")).toBe("tel:+553135678819");
  });

  it("todo link de WhatsApp tem text= decodificável para uma das 2 mensagens", () => {
    const whatsapp = links.filter((a) => a.getAttribute("href")!.includes("wa.me"));
    expect(whatsapp.length).toBeGreaterThan(0);
    for (const a of whatsapp) {
      const url = new URL(a.getAttribute("href")!);
      expect(url.pathname).toBe(`/${site.whatsapp.number}`);
      expect(Object.values(site.messages)).toContain(url.searchParams.get("text"));
    }
  });

  it("todo target=_blank tem rel com noopener", () => {
    const blank = root.querySelectorAll('[target="_blank"]');
    expect(blank.length).toBeGreaterThan(0);
    for (const a of blank) expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("todo CTA de WhatsApp ou telefone tem evento e local válidos", () => {
    const ctas = links.filter((a) => /wa\.me|^tel:/.test(a.getAttribute("href")!));
    for (const a of ctas) {
      const href = a.getAttribute("href")!;
      const expected = href.startsWith("tel:") ? "cta-telefone" : "cta-whatsapp";
      expect(a.getAttribute("data-umami-event"), href).toBe(expected);
      expect(analyticsEvents).toContain(a.getAttribute("data-umami-event"));
      expect(analyticsLocals).toContain(a.getAttribute("data-umami-event-local"));
    }
    const used = new Set(ctas.map((a) => a.getAttribute("data-umami-event-local")));
    for (const local of analyticsLocals) expect(used.has(local), `local ${local}`).toBe(true);
  });

  it("não há link para o app (L7)", () => {
    for (const a of links) {
      const href = a.getAttribute("href")!;
      expect(href).not.toContain("fitburn.faglionidev.com");
      expect(href).not.toMatch(/^\/app(\/|$)/);
    }
  });

  it("o único iframe é o do Maps, com title, loading=lazy e o src do site.ts", () => {
    const frames = root.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("src")).toBe(site.maps.embed);
    expect(frames[0].getAttribute("loading")).toBe("lazy");
    expect(frames[0].getAttribute("title")).toMatch(/^Mapa:/);
  });

  it("a barra fixa e o cabeçalho estão presentes", () => {
    expect(root.querySelector('nav[aria-label="Ações rápidas"]')).not.toBeNull();
    expect(root.querySelector("header a.cta")).not.toBeNull();
  });
});
