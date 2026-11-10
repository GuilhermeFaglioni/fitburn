import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { seo } from "../src/content/copy";
import { DEFAULT_SITE_URL, ROOT, buildTo, page, readDist, readFrom, walk } from "./helpers";
import { rmSync } from "node:fs";

describe("metas da home", () => {
  const root = page();

  it("title igual ao da 7.1 e curto o bastante para a página de resultados", () => {
    const title = root.querySelector("title")?.text;
    expect(title).toBe(seo.title);
    // O plano diz "58 caracteres", mas o texto aprovado tem 61. O texto manda; o teto fica em 62 para não deixar
    // o title crescer sem querer (decisão registrada no PR).
    expect(title!.length).toBe(61);
    expect(title!.length).toBeLessThanOrEqual(62);
  });

  it("tem uma única meta description, igual à da 7.1 e com no máximo 155 caracteres", () => {
    const metas = root.querySelectorAll('meta[name="description"]');
    expect(metas).toHaveLength(1);
    const content = metas[0].getAttribute("content")!;
    expect(content).toBe(seo.description);
    expect(content.length).toBeLessThanOrEqual(155);
  });

  it("não tem meta keywords", () => {
    expect(root.querySelector('meta[name="keywords"]')).toBeNull();
  });

  it("canonical é a URL do site com barra", () => {
    expect(root.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${DEFAULT_SITE_URL}/`);
  });

  it("Open Graph com imagem absoluta de 1200x630", () => {
    const image = root.querySelector('meta[property="og:image"]')?.getAttribute("content");
    expect(image).toBe(`${DEFAULT_SITE_URL}/og.png`);
    expect(root.querySelector('meta[property="og:image:width"]')?.getAttribute("content")).toBe("1200");
    expect(root.querySelector('meta[property="og:image:height"]')?.getAttribute("content")).toBe("630");
    expect(root.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(`${DEFAULT_SITE_URL}/`);
    expect(root.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe("summary_large_image");
    const png = readFileSync(join(ROOT, "public/og.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("o apple-touch-icon tem 180x180", () => {
    const png = readFileSync(join(ROOT, "public/apple-touch-icon.png"));
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });

  it("sem PUBLIC_INDEXABLE: noindex na página, robots.txt sem Sitemap e sitemap-index existe", () => {
    expect(root.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
    const robots = readDist("robots.txt");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).not.toContain("Sitemap:");
    expect(robots).not.toContain("Disallow");
    expect(readDist("sitemap-index.xml")).toContain("sitemap-0.xml");
    expect(readDist("sitemap-0.xml")).toContain(`${DEFAULT_SITE_URL}/`);
  });

  it("a 404 tem noindex, H1 e link para o início", () => {
    const notFound = page("404.html");
    expect(notFound.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
    expect(notFound.querySelector("h1")?.text).toBe("Página não encontrada");
    expect(notFound.querySelector('a[href="/"]')).not.toBeNull();
  });
});

describe("build indexável (PUBLIC_INDEXABLE=true)", () => {
  const out = buildTo({ PUBLIC_INDEXABLE: "true", PUBLIC_SITE_URL: "https://www.exemplo.test/" });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("remove o noindex e coloca o Sitemap no robots.txt", () => {
    const html = parse(readFrom(out, "index.html"));
    expect(html.querySelector('meta[name="robots"]')).toBeNull();
    expect(html.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://www.exemplo.test/");
    const robots = readFrom(out, "robots.txt");
    expect(robots).toContain("Sitemap: https://www.exemplo.test/sitemap-index.xml");
    expect(readFrom(out, "sitemap-0.xml")).toContain("https://www.exemplo.test/");
  });

  it("a 404 continua com noindex", () => {
    const html = parse(readFrom(out, "404.html"));
    expect(html.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
    expect(walk(out).some((file) => file === "sitemap-index.xml")).toBe(true);
  });
});
