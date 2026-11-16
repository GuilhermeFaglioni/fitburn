import { describe, expect, it } from "vitest";
import { faqJsonLd, gymJsonLd, jsonLdString } from "../src/lib/schema";
import { readEnv } from "../src/lib/env";
import { whatsappUrl } from "../src/lib/whatsapp";
import { emphasis } from "../src/lib/emphasis";
import { site } from "../src/content/site";

describe("whatsappUrl", () => {
  it("codifica acentos e exclamação", () => {
    expect(whatsappUrl("Olá! Quero")).toBe("https://wa.me/5531985141034?text=Ol%C3%A1!%20Quero".replace("!", "!"));
    expect(decodeURIComponent(new URL(whatsappUrl("Olá! é")).searchParams.get("text")!)).toBe("Olá! é");
  });
});

describe("schema", () => {
  it("gymJsonLd usa a URL do site", () => {
    const g = gymJsonLd(site, "https://exemplo.test");
    expect(g["@id"]).toBe("https://exemplo.test/#gym");
    expect(g.openingHoursSpecification).toHaveLength(2);
  });
  it("faqJsonLd espelha as perguntas", () => {
    const f = faqJsonLd([{ q: "P?", a: "R." }]);
    expect(f.mainEntity[0]).toEqual({ "@type": "Question", name: "P?", acceptedAnswer: { "@type": "Answer", text: "R." } });
  });
  it("jsonLdString escapa <", () => {
    expect(jsonLdString({ a: "</script>" })).not.toContain("<");
  });
});

describe("env", () => {
  it("PUBLIC_INDEXABLE só é verdadeiro com 'true'", () => {
    expect(readEnv({ PUBLIC_INDEXABLE: "true" }).indexable).toBe(true);
    for (const v of ["1", "TRUE", "", "false", undefined]) expect(readEnv({ PUBLIC_INDEXABLE: v }).indexable).toBe(false);
  });
  it("a URL perde a barra final e tem padrão", () => {
    expect(readEnv({ PUBLIC_SITE_URL: "https://a.test///" }).siteUrl).toBe("https://a.test");
    expect(readEnv({}).siteUrl).toBe("https://site.fitburn.faglionidev.com");
  });
  it("analytics exige as duas variáveis", () => {
    expect(readEnv({ PUBLIC_UMAMI_SRC: "x" }).analytics).toBe(false);
    expect(readEnv({ PUBLIC_UMAMI_SRC: "x", PUBLIC_UMAMI_WEBSITE_ID: "y" }).analytics).toBe(true);
  });
});

describe("emphasis", () => {
  it("troca *x* por <em>", () => {
    expect(emphasis("a *b* c")).toBe("a <em>b</em> c");
  });
});
