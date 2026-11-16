import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { site } from "../src/content/site";
import { buildWith, page, readDist, root } from "./helpers";

const SITE = "https://site.fitburn.faglionidev.com";
const head = page();

describe("SEO", () => {
  it("title e description seguem a 7.1", () => {
    const title = head.querySelector("title")!.text;
    expect(title).toBe("Estúdio de Musculação no Silveira, BH | Aula Grátis | Fitburn");
    // A spec diz 58 caracteres, mas o texto fixo tem 61 (contagem da spec errada); o texto manda.
    expect(title.length).toBeLessThanOrEqual(61);
    const d = head.querySelectorAll('meta[name="description"]');
    expect(d).toHaveLength(1);
    expect(d[0]!.getAttribute("content")).toBe(site.meta.description);
    expect(site.meta.description.length).toBeLessThanOrEqual(155);
  });

  it("não tem meta keywords", () => {
    expect(head.querySelector('meta[name="keywords"]')).toBeNull();
  });

  it("canonical e og:image são absolutos", () => {
    expect(head.querySelector('link[rel="canonical"]')!.getAttribute("href")).toBe(`${SITE}/`);
    expect(head.querySelector('meta[property="og:image"]')!.getAttribute("content")).toBe(`${SITE}/og.png`);
  });

  it("og.png tem 1200x630", () => {
    const png = readFileSync(join(root, "public/og.png"));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("apple-touch-icon tem 180x180", () => {
    const png = readFileSync(join(root, "public/apple-touch-icon.png"));
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });

  it("sem PUBLIC_INDEXABLE: noindex e robots sem Sitemap", () => {
    expect(head.querySelector('meta[name="robots"]')!.getAttribute("content")).toContain("noindex");
    expect(readDist("robots.txt")).not.toContain("Sitemap:");
    expect(readDist("robots.txt")).not.toContain("Disallow");
  });

  it("com PUBLIC_INDEXABLE=true: sem noindex e com Sitemap", () => {
    const out = buildWith({ PUBLIC_INDEXABLE: "true" });
    expect(page("index.html", out).querySelector('meta[name="robots"]')).toBeNull();
    expect(readDist("robots.txt", out)).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
  });

  it("gera o sitemap-index.xml", () => {
    expect(readDist("sitemap-index.xml")).toContain("sitemap-0.xml");
  });

  it("404 tem noindex mesmo indexável", () => {
    expect(page("404.html").querySelector('meta[name="robots"]')!.getAttribute("content")).toContain("noindex");
    const out = buildWith({ PUBLIC_INDEXABLE: "true" });
    expect(page("404.html", out).querySelector('meta[name="robots"]')!.getAttribute("content")).toContain("noindex");
  });
});
