import { describe, expect, it } from "vitest";
import { faq } from "../src/content/faq";
import { site } from "../src/content/site";
import { page } from "./helpers";

const root = page();
const blocks = root.querySelectorAll('script[type="application/ld+json"]');
const [gym, faqLd] = blocks.map((b) => JSON.parse(b.text));
const text = root.text.replace(/\s+/g, " ");

describe("JSON-LD", () => {
  it("os dois blocos fazem parse", () => {
    expect(blocks).toHaveLength(2);
    expect(gym["@type"]).toBe("ExerciseGym");
    expect(faqLd["@type"]).toBe("FAQPage");
  });

  it("ExerciseGym traz os campos da 7.2 e nada de preço ou nota", () => {
    for (const k of ["@id", "name", "url", "image", "logo", "description", "telephone", "address", "geo", "hasMap", "openingHoursSpecification", "contactPoint", "paymentAccepted", "sameAs"]) {
      expect(gym, k).toHaveProperty(k);
    }
    expect(gym).not.toHaveProperty("priceRange");
    expect(gym).not.toHaveProperty("aggregateRating");
  });

  it("endereço, telefone e horários batem com o texto visível", () => {
    expect(text).toContain(gym.address.streetAddress);
    expect(text).toContain(gym.address.postalCode);
    expect(text).toContain(site.phone.display);
    expect(text).toContain(site.whatsapp.display);
    for (const h of gym.openingHoursSpecification) {
      expect(text).toContain(`${h.opens} às ${h.closes}`);
    }
  });

  it("as 7 perguntas do FAQPage batem com o HTML, na mesma ordem", () => {
    const q = root.querySelectorAll("details").map((d) => d.querySelector("summary")!.text.trim());
    const a = root.querySelectorAll("details").map((d) => d.querySelector("p")!.text.trim());
    expect(faqLd.mainEntity.map((e: { name: string }) => e.name)).toEqual(q);
    expect(faqLd.mainEntity.map((e: { acceptedAnswer: { text: string } }) => e.acceptedAnswer.text)).toEqual(a);
    expect(q).toEqual(faq.map((f) => f.q));
  });

  it("nenhum JSON-LD fecha o script", () => {
    for (const b of blocks) expect(b.text).not.toContain("</script");
  });
});
