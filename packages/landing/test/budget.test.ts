import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { DIST, buildTo, readDist, readFrom, walk } from "./helpers";

const KB = 1024;
const size = (path: string) => statSync(path).size;

describe("orçamento de performance", () => {
  const files = walk(DIST);

  it("nenhum .js em dist e nenhum <script> além do ld+json", () => {
    expect(files.filter((f) => f.endsWith(".js"))).toEqual([]);
    for (const file of ["index.html", "404.html"]) {
      for (const script of parse(readDist(file)).querySelectorAll("script")) {
        expect(script.getAttribute("type")).toBe("application/ld+json");
      }
    }
  });

  it("CSS total em dist/_astro <= 30 KB", () => {
    const css = files.filter((f) => f.startsWith("_astro/") && f.endsWith(".css"));
    const total = css.reduce((sum, f) => sum + size(join(DIST, f)), 0);
    expect(total).toBeLessThanOrEqual(30 * KB);
  });

  it("index.html <= 60 KB", () => {
    expect(size(join(DIST, "index.html"))).toBeLessThanOrEqual(60 * KB);
  });

  it("as fontes woff2 somam <= 120 KB e todas vêm do próprio site", () => {
    const fonts = files.filter((f) => f.endsWith(".woff2"));
    expect(fonts.length).toBe(4);
    expect(files.filter((f) => /\.(woff|ttf|otf)$/.test(f))).toEqual([]);
    expect(fonts.reduce((sum, f) => sum + size(join(DIST, f)), 0)).toBeLessThanOrEqual(120 * KB);
    const css = readdirSync(join(DIST, "_astro")).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(DIST, "_astro", f), "utf8")).join("");
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it("só há um preload de fonte (DM Sans 700)", () => {
    const preloads = parse(readDist("index.html")).querySelectorAll('link[rel="preload"]');
    expect(preloads).toHaveLength(1);
    expect(preloads[0].getAttribute("href")).toMatch(/dm-sans-latin-700-normal/);
  });

  it("imagens geradas: a maior variante AVIF do herói <= 180 KB e as demais <= 120 KB", () => {
    const images = files.filter((f) => f.startsWith("_astro/") && /\.(avif|webp|jpe?g|png)$/.test(f));
    // Sem fotos de banco no repositório (placeholders), não há imagem gerada para medir.
    if (images.length === 0) return;
    const heroSources = parse(readDist("index.html"))
      .querySelectorAll("#inicio source[type='image/avif']")
      .flatMap((s) => (s.getAttribute("srcset") ?? "").split(",").map((p) => p.trim().split(" ")[0]));
    const heroFiles = heroSources.map((src) => src.replace(/^\//, ""));
    for (const image of images) {
      const limit = heroFiles.includes(image) && image.endsWith(".avif") ? 180 * KB : 120 * KB;
      expect(size(join(DIST, image)), image).toBeLessThanOrEqual(limit);
    }
  });
});

describe("analytics (PUBLIC_UMAMI_*)", () => {
  const out = buildTo({
    PUBLIC_UMAMI_SRC: "https://umami.exemplo.test/script.js",
    PUBLIC_UMAMI_WEBSITE_ID: "00000000-0000-4000-8000-000000000000",
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("o script do Umami tem defer, data-website-id e data-domains", () => {
    const script = parse(readFrom(out, "index.html")).querySelector('script[src="https://umami.exemplo.test/script.js"]');
    expect(script).not.toBeNull();
    expect(script?.hasAttribute("defer")).toBe(true);
    expect(script?.getAttribute("data-website-id")).toBe("00000000-0000-4000-8000-000000000000");
    expect(script?.getAttribute("data-domains")).toBe("site.fitburn.faglionidev.com");
  });

  it("sem as variáveis, o build padrão não tem o script", () => {
    expect(readDist("index.html")).not.toContain("data-website-id");
  });
});
