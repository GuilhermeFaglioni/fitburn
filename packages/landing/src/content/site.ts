export const site = {
  name: "Fitburn Brasil",
  address: {
    street: "Rua Ilacir Pereira Lima, 166, Loja 04",
    district: "Silveira",
    city: "Belo Horizonte",
    region: "MG",
    postalCode: "31140-540",
    country: "BR",
  },
  addressDisplay:
    "Rua Ilacir Pereira Lima, 166, Loja 04 · Silveira, Belo Horizonte, MG · CEP 31140-540",
  geo: { lat: -19.8925232, lng: -43.9288867 },
  phone: { display: "(31) 3567-8819", tel: "+553135678819" },
  whatsapp: { display: "(31) 9 8514-1034", number: "5531985141034" },
  hours: [
    {
      days: "Segunda a sexta",
      opens: "05:30",
      closes: "22:00",
      schemaDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    },
    { days: "Sábado", opens: "08:00", closes: "12:00", schemaDays: ["Saturday"] },
  ],
  hoursShort: "Seg a sex, 5h30 às 22h · sáb, 8h às 12h",
  social: {
    instagram: "https://www.instagram.com/fitburnbrasil/",
    facebook: "https://www.facebook.com/Fitburn.treinamentofuncional",
    youtube: "https://www.youtube.com/channel/UCFyNZEz9lIOhao_MRHbTeHw",
  },
  messages: {
    trial: "Olá! Quero agendar minha aula experimental grátis no Fitburn.",
    plans: "Olá! Quero conhecer os planos do Fitburn.",
  },
  maps: {
    embed:
      "https://www.google.com/maps?q=Rua%20Ilacir%20Pereira%20Lima%2C%20166%2C%20Silveira%2C%20Belo%20Horizonte%20-%20MG&z=16&output=embed",
    link: "https://www.google.com/maps/search/?api=1&query=Rua%20Ilacir%20Pereira%20Lima%2C%20166%2C%20Silveira%2C%20Belo%20Horizonte%20-%20MG",
  },
  paymentAccepted: "Cartão de crédito, cartão de débito, Pix e dinheiro",
  meta: {
    title: "Estúdio de Musculação no Silveira | Aula Grátis | Fitburn",
    description:
      "Musculação no Silveira, BH: 1 professor para cada 4 alunos, avaliação completa e aula experimental grátis. Agende pelo WhatsApp.",
    ogTitle: "Chega de treinar sozinho. | Fitburn Brasil",
    ogDescription:
      "Musculação no Silveira, BH, com 1 professor para cada 4 alunos. Sua primeira aula é grátis.",
    ogAlt: "Fitburn Brasil: musculação com 1 professor para cada 4 alunos, no Silveira, BH.",
  },
} as const;

export type Site = typeof site;
export const umamiLocals = [
  "header",
  "hero",
  "diferenciais",
  "planos",
  "duvidas",
  "contato",
  "barra",
] as const;
export type UmamiLocal = (typeof umamiLocals)[number];
