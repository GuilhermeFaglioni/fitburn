import { describe, expect, it } from "vitest";
import { faq } from "../src/content/faq";
import { site } from "../src/content/site";
import type { faqJsonLd, gymJsonLd } from "../src/lib/schema";
import { page, readDist, textOf } from "./helpers";

type Gym = ReturnType<typeof gymJsonLd>;
type FaqLd = ReturnType<typeof faqJsonLd>;

const root = page();
const blocks = root.querySelectorAll('script[type="application/ld+json"]');
const gym = JSON.parse(blocks[0].textContent) as Gym;
const faqPage = JSON.parse(blocks[1].textContent) as FaqLd;

describe("JSON-LD", () => {
  it("tem dois blocos ld+json que fazem parse", () => {
    expect(blocks).toHaveLength(2);
    expect(gym["@type"]).toBe("ExerciseGym");
    expect(faqPage["@type"]).toBe("FAQPage");
  });

  it("ExerciseGym tem os campos da 7.2, sem priceRange e sem aggregateRating", () => {
    for (const key of [
      "@context", "@id", "name", "url", "image", "logo", "description", "telephone", "address", "geo",
      "hasMap", "openingHoursSpecification", "contactPoint", "paymentAccepted", "sameAs",
    ]) {
      expect(gym, key).toHaveProperty(key);
    }
    expect(gym).not.toHaveProperty("priceRange");
    expect(gym).not.toHaveProperty("aggregateRating");
    expect(gym.name).toBe("Fitburn Brasil");
    expect(gym.telephone).toBe("+55 31 3567-8819");
    expect(gym.contactPoint[0].telephone).toBe("+55 31 98514-1034");
    expect(gym.hasMap).toBe(site.maps.link);
  });

  it("endereço, telefones e horários do JSON-LD batem com o texto visível do Contato", () => {
    const contact = textOf(root.querySelector("#contato")!);
    expect(contact).toContain(gym.address.streetAddress);
    expect(contact).toContain(gym.address.addressLocality);
    expect(contact).toContain(`CEP ${gym.address.postalCode}`);
    const digits = (value: string) => value.replace(/\D/g, "");
    expect(digits(contact)).toContain(digits(gym.telephone).slice(2));
    expect(digits(contact)).toContain(digits(gym.contactPoint[0].telephone).slice(2));
    const [weekdays, saturday] = gym.openingHoursSpecification;
    const hours = root.querySelectorAll("#contato dl > div").map((row) => [
      textOf(row.querySelector("dt")!),
      textOf(row.querySelector("dd")!),
    ]);
    expect(hours).toEqual([
      ["Segunda a sexta", `${weekdays.opens} às ${weekdays.closes}`],
      ["Sábado", `${saturday.opens} às ${saturday.closes}`],
    ]);
    expect(weekdays.dayOfWeek).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(saturday.dayOfWeek).toEqual(["Saturday"]);
  });

  it("as 7 perguntas e respostas do FAQPage são idênticas ao HTML, na mesma ordem", () => {
    const items = root.querySelectorAll("#duvidas details");
    expect(items).toHaveLength(7);
    const html = items.map((item) => [textOf(item.querySelector("summary")!), textOf(item.querySelector("p")!)]);
    const ld = faqPage.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]);
    expect(ld).toEqual(html);
    expect(ld).toEqual(faq.map((f) => [f.question, f.answer]));
  });

  it("nenhum </script dentro do JSON", () => {
    for (const block of blocks) expect(block.textContent.toLowerCase()).not.toContain("</script");
    expect(readDist("index.html").match(/<\/script/gi)?.length).toBe(2);
  });
});
