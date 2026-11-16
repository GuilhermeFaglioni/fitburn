import type { FaqItem } from "../content/faq";
import type { Site } from "../content/site";

/** Serializa para dentro de <script type="application/ld+json">, sem permitir fechar a tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function gymJsonLd(s: Site, siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    "@id": `${siteUrl}/#gym`,
    name: s.name,
    url: `${siteUrl}/`,
    image: `${siteUrl}/og.png`,
    logo: `${siteUrl}/flame.svg`,
    description: s.meta.description,
    telephone: "+55 31 3567-8819",
    address: {
      "@type": "PostalAddress",
      streetAddress: s.address.street,
      addressLocality: s.address.city,
      addressRegion: s.address.region,
      postalCode: s.address.postalCode,
      addressCountry: s.address.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: s.geo.lat, longitude: s.geo.lng },
    hasMap: s.maps.link,
    openingHoursSpecification: s.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [...h.schemaDays],
      opens: h.opens,
      closes: h.closes,
    })),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: "+55 31 98514-1034",
        availableLanguage: "pt-BR",
      },
    ],
    paymentAccepted: s.paymentAccepted,
    sameAs: [s.social.instagram, s.social.facebook, s.social.youtube],
  };
}

export function faqJsonLd(items: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}
