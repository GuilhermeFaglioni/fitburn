import { describe, expect, it } from "vitest";
import { faq } from "../src/content/faq";
import { site, type SiteData } from "../src/content/site";
import { splitEmphasis, stripEmphasis } from "../src/lib/emphasis";
import { DEFAULT_SITE_URL, readEnv } from "../src/lib/env";
import { faqJsonLd, gymJsonLd, serializeJsonLd } from "../src/lib/schema";
import { whatsappUrl } from "../src/lib/whatsapp";

describe("whatsappUrl", () => {
  it("usa o número do site e codifica acentos e exclamação", () => {
    const url = whatsappUrl("Olá! Quero agendar.");
    expect(url).toBe("https://wa.me/5531985141034?text=Ol%C3%A1!%20Quero%20agendar.");
    expect(new URL(url).searchParams.get("text")).toBe("Olá! Quero agendar.");
  });

  it("a mensagem de aula experimental volta inteira ao decodificar", () => {
    const text = new URL(whatsappUrl(site.messages.trial)).searchParams.get("text");
    expect(text).toBe(site.messages.trial);
  });

  it("codifica '!' quando vem sozinho", () => {
    expect(encodeURIComponent("!")).toBe("!");
    expect(whatsappUrl("a&b=c")).toContain("a%26b%3Dc");
  });
});

describe("JSON-LD", () => {
  const example: SiteData = {
    name: "Estúdio Exemplo",
    address: {
      street: "Rua A, 1",
      district: "Centro",
      city: "Cidade",
      region: "UF",
      postalCode: "00000-000",
      country: "BR",
    },
    geo: { lat: 1.5, lng: -2.5 },
    phone: { schema: "+55 11 1111-1111" },
    whatsapp: { schema: "+55 11 91111-1111" },
    hours: [{ opens: "06:00", closes: "20:00", schemaDays: ["Monday"] }],
    social: { instagram: "https://i.example/", facebook: "https://f.example/", youtube: "https://y.example/" },
    maps: { link: "https://maps.example/" },
    paymentAccepted: "Pix",
  };

  it("gymJsonLd monta o ExerciseGym a partir dos dados", () => {
    const gym = gymJsonLd({ siteUrl: "https://exemplo.test", description: "Descrição." }, example);
    expect(gym["@type"]).toBe("ExerciseGym");
    expect(gym["@id"]).toBe("https://exemplo.test/#gym");
    expect(gym.url).toBe("https://exemplo.test/");
    expect(gym.image).toBe("https://exemplo.test/og.png");
    expect(gym.address.streetAddress).toBe("Rua A, 1");
    expect(gym.geo).toEqual({ "@type": "GeoCoordinates", latitude: 1.5, longitude: -2.5 });
    expect(gym.openingHoursSpecification[0]).toMatchObject({ dayOfWeek: ["Monday"], opens: "06:00" });
    expect(gym.sameAs).toEqual(["https://i.example/", "https://f.example/", "https://y.example/"]);
    expect(gym).not.toHaveProperty("priceRange");
    expect(gym).not.toHaveProperty("aggregateRating");
  });

  it("faqJsonLd repete perguntas e respostas na ordem", () => {
    const ld = faqJsonLd([
      { question: "P1?", answer: "R1." },
      { question: "P2?", answer: "R2." },
    ]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual([
      ["P1?", "R1."],
      ["P2?", "R2."],
    ]);
    expect(faqJsonLd(faq).mainEntity).toHaveLength(7);
  });

  it("serializeJsonLd escapa '<' para nunca fechar o script", () => {
    const out = serializeJsonLd({ text: "</script><b>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).text).toBe("</script><b>");
  });
});

describe("readEnv", () => {
  it("PUBLIC_INDEXABLE só é verdadeiro com 'true'", () => {
    expect(readEnv({}).indexable).toBe(false);
    expect(readEnv({ PUBLIC_INDEXABLE: "false" }).indexable).toBe(false);
    expect(readEnv({ PUBLIC_INDEXABLE: "1" }).indexable).toBe(false);
    expect(readEnv({ PUBLIC_INDEXABLE: "TRUE" }).indexable).toBe(false);
    expect(readEnv({ PUBLIC_INDEXABLE: "true" }).indexable).toBe(true);
  });

  it("a URL perde a barra final e tem padrão", () => {
    expect(readEnv({}).siteUrl).toBe(DEFAULT_SITE_URL);
    expect(readEnv({ PUBLIC_SITE_URL: "https://exemplo.test/" }).siteUrl).toBe("https://exemplo.test");
    expect(readEnv({ PUBLIC_SITE_URL: "https://exemplo.test///" }).siteUrl).toBe("https://exemplo.test");
  });

  it("recusa uma URL inválida", () => {
    expect(() => readEnv({ PUBLIC_SITE_URL: "isto não é url" })).toThrow(/PUBLIC_SITE_URL/);
  });

  it("o Umami só entra com as duas variáveis", () => {
    expect(readEnv({ PUBLIC_UMAMI_SRC: "https://u.test/script.js" }).umami).toBeNull();
    expect(readEnv({ PUBLIC_UMAMI_WEBSITE_ID: "abc" }).umami).toBeNull();
    expect(
      readEnv({
        PUBLIC_SITE_URL: "https://exemplo.test/",
        PUBLIC_UMAMI_SRC: "https://u.test/script.js",
        PUBLIC_UMAMI_WEBSITE_ID: "abc",
      }).umami,
    ).toEqual({ src: "https://u.test/script.js", websiteId: "abc", domain: "exemplo.test" });
  });
});

describe("emphasis", () => {
  it("separa o trecho entre asteriscos", () => {
    expect(splitEmphasis("Três passos até o seu *primeiro treino*.")).toEqual([
      { text: "Três passos até o seu ", em: false },
      { text: "primeiro treino", em: true },
      { text: ".", em: false },
    ]);
    expect(stripEmphasis("a *b* c")).toBe("a b c");
  });
});
