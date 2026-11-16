import { describe, expect, it } from "vitest";
import { site, umamiLocals } from "../src/content/site";
import { page } from "./helpers";

const root = page();
const links = root.querySelectorAll("a[href]");
const allowedHosts = ["wa.me", "www.google.com", "www.instagram.com", "www.facebook.com", "www.youtube.com"];

describe("links", () => {
  it("todo href externo está na lista permitida", () => {
    for (const a of links) {
      const href = a.getAttribute("href")!;
      if (href.startsWith("tel:")) {
        expect(href).toBe("tel:+553135678819");
      } else if (/^https?:/.test(href)) {
        const u = new URL(href);
        expect(allowedHosts, href).toContain(u.host);
        if (u.host === "www.google.com") expect(u.pathname).toMatch(/^\/maps/);
      }
    }
  });

  it("todo link de WhatsApp decodifica para uma das mensagens", () => {
    const wa = links.filter((a) => a.getAttribute("href")!.startsWith("https://wa.me/"));
    expect(wa.length).toBeGreaterThan(0);
    for (const a of wa) {
      const u = new URL(a.getAttribute("href")!);
      expect(u.pathname).toBe(`/${site.whatsapp.number}`);
      expect(Object.values(site.messages)).toContain(u.searchParams.get("text"));
    }
  });

  it("todo target=_blank tem rel noopener", () => {
    for (const a of root.querySelectorAll('[target="_blank"]')) expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("todo CTA de WhatsApp ou telefone tem evento Umami com local válido", () => {
    const ctas = links.filter((a) => a.getAttribute("class")?.includes("cta"));
    expect(ctas.length).toBeGreaterThan(0);
    for (const a of ctas) {
      const href = a.getAttribute("href")!;
      if (!href.startsWith("https://wa.me/") && !href.startsWith("tel:")) continue;
      expect(["cta-whatsapp", "cta-telefone"]).toContain(a.getAttribute("data-umami-event"));
      expect(umamiLocals).toContain(a.getAttribute("data-umami-event-local"));
    }
  });

  it("não aponta para o app", () => {
    for (const a of links) {
      const href = a.getAttribute("href")!;
      expect(href).not.toContain("fitburn.faglionidev.com");
      expect(href.startsWith("/app")).toBe(false);
    }
  });

  it("o único iframe é o do Maps", () => {
    const frames = root.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    const f = frames[0]!;
    expect(f.getAttribute("title")).toBeTruthy();
    expect(f.getAttribute("loading")).toBe("lazy");
    expect(f.getAttribute("src")).toBe(site.maps.embed);
  });
});
