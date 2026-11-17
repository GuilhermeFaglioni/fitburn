import type { FaqItem } from "../content/faq";
import { site, type SiteData } from "../content/site";

export interface GymSchemaInput {
  siteUrl: string;
  description: string;
}

/** ExerciseGym (schema.org), gerado de `site.ts`. Sem `priceRange` e sem `aggregateRating`. */
export function gymJsonLd(input: GymSchemaInput, data: SiteData = site) {
  const { siteUrl, description } = input;
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    "@id": `${siteUrl}/#gym`,
    name: data.name,
    url: `${siteUrl}/`,
    image: `${siteUrl}/og.png`,
    logo: `${siteUrl}/flame.svg`,
    description,
    telephone: data.phone.schema,
    address: {
      "@type": "PostalAddress",
      streetAddress: data.address.street,
      addressLocality: data.address.city,
      addressRegion: data.address.region,
      postalCode: data.address.postalCode,
      addressCountry: data.address.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: data.geo.lat,
      longitude: data.geo.lng,
    },
    hasMap: data.maps.link,
    openingHoursSpecification: data.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [...h.schemaDays],
      opens: h.opens,
      closes: h.closes,
    })),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: data.whatsapp.schema,
        availableLanguage: "pt-BR",
      },
    ],
    paymentAccepted: data.paymentAccepted,
    sameAs: [data.social.instagram, data.social.facebook, data.social.youtube],
  };
}

/** FAQPage (schema.org): perguntas e respostas idênticas às do HTML. */
export function faqJsonLd(items: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Serializa para um `<script type="application/ld+json">` sem permitir `</script>` no conteúdo. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
