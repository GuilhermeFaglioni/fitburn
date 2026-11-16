import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWith, dist, page, readDist, walk } from "./helpers";

const kb = (f: string) => statSync(f).size / 1024;
const files = walk(dist);

describe("orçamento de performance", () => {
  it("não há .js no dist nem <script> além de ld+json", () => {
    expect(files.filter((f) => f.endsWith(".js"))).toEqual([]);
    for (const s of page().querySelectorAll("script")) expect(s.getAttribute("type")).toBe("application/ld+json");
  });

  it("CSS total até 30 KB", () => {
    const total = files.filter((f) => f.endsWith(".css")).reduce((n, f) => n + kb(f), 0);
    expect(total).toBeLessThanOrEqual(30);
  });

  it("index.html até 60 KB", () => {
    expect(kb(join(dist, "index.html"))).toBeLessThanOrEqual(60);
  });

  it("fontes woff2 somam até 120 KB", () => {
    const total = files.filter((f) => f.endsWith(".woff2")).reduce((n, f) => n + kb(f), 0);
    expect(total).toBeLessThanOrEqual(120);
  });

  it("imagens geradas respeitam o limite (hero AVIF até 180 KB, demais até 120 KB)", () => {
    const imgs = files.filter((f) => /\.(avif|webp|jpe?g)$/.test(f));
    for (const f of imgs) expect(kb(f), f).toBeLessThanOrEqual(/hero.*\.avif$/.test(f) ? 180 : 120);
  });

  it("com Umami configurado, o script tem defer, website-id e domains", () => {
    const out = buildWith({
      PUBLIC_UMAMI_SRC: "https://umami.example.test/script.js",
      PUBLIC_UMAMI_WEBSITE_ID: "00000000-0000-0000-0000-000000000000",
    });
    const s = page("index.html", out).querySelector('script[src="https://umami.example.test/script.js"]')!;
    expect(s.hasAttribute("defer")).toBe(true);
    expect(s.getAttribute("data-website-id")).toBe("00000000-0000-0000-0000-000000000000");
    expect(s.getAttribute("data-domains")).toBe("site.fitburn.faglionidev.com");
  });

  it("sem as duas variáveis do Umami, o script não entra", () => {
    const out = buildWith({ PUBLIC_UMAMI_SRC: "https://umami.example.test/script.js" });
    expect(readDist("index.html", out)).not.toContain("umami.example.test");
    expect(page("index.html", out).querySelectorAll("script").every((s) => s.getAttribute("type") === "application/ld+json")).toBe(true);
  });
});
