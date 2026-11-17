/**
 * Textos finais da landing (seção 5 do plano 010). Trechos entre asteriscos são a ênfase em itálico
 * (`<em>`, no máximo uma por título). Os componentes só leem daqui.
 */
export const seo = {
  title: "Estúdio de Musculação no Silveira, BH | Aula Grátis | Fitburn",
  description:
    "Musculação no Silveira, BH: 1 professor para cada 4 alunos, avaliação completa e aula experimental grátis. Agende pelo WhatsApp.",
  ogTitle: "Chega de treinar sozinho. | Fitburn Brasil",
  ogDescription:
    "Musculação no Silveira, BH, com 1 professor para cada 4 alunos. Sua primeira aula é grátis.",
  ogImageAlt: "Fitburn Brasil: musculação com 1 professor para cada 4 alunos, no Silveira, BH.",
} as const;

export const ui = {
  skipLink: "Pular para o conteúdo",
  newTab: "(abre em nova aba)",
  logoLabel: "Fitburn Brasil, início",
} as const;

export const header = {
  navLabel: "Principal",
  nav: [
    { label: "Como funciona", href: "#como-funciona" },
    { label: "Modalidades", href: "#modalidades" },
    { label: "Estrutura", href: "#estrutura" },
    { label: "Dúvidas", href: "#duvidas" },
    { label: "Contato", href: "#contato" },
  ],
  cta: "Agendar aula grátis",
} as const;

export const hero = {
  kicker: "ESTÚDIO DE MUSCULAÇÃO · SILVEIRA, BH",
  line1: "Chega de treinar sozinho.",
  line2: "Musculação com 1 professor para cada *4 alunos*, no Silveira.",
  lead: "Avaliação de entrada, treino individual e no máximo 400 alunos no estúdio. A primeira aula é por nossa conta.",
  primary: "Agendar minha aula grátis",
  secondary: "Ligar agora",
  support: "Seg a sex, 5h30 às 22h · sáb, 8h às 12h",
  photoAlt: "Professor orienta aluna durante agachamento com barra em um ambiente de treino escuro",
} as const;

export const facts = {
  label: "Fitburn em números",
  items: [
    {
      value: "1:4",
      caption: "professor para cada 4 alunos",
      accessible: "1 professor para cada 4 alunos",
    },
    { value: "400", caption: "alunos no máximo, por escolha" },
    { value: "5h30", caption: "o primeiro treino do dia" },
    { value: "2", caption: "avaliações de entrada: bioimpedância e biomecânica" },
  ],
} as const;

export const differentials = {
  kicker: "NÃO SOMOS UMA ACADEMIA COMUM",
  title: "Não é promessa. É *estrutura*.",
  items: [
    {
      title: "Acompanhamento real",
      text: "Um professor para cada 4 alunos. Seu treino é corrigido, ajustado e evoluído em cada sessão, sem fila e sem esperar a sua vez.",
    },
    {
      title: "Avaliação antes do primeiro treino",
      text: "Bioimpedância e avaliação biomecânica individuais. Seu plano é feito para o seu corpo, não para uma turma genérica.",
    },
    {
      title: "Saúde no mesmo lugar",
      text: "Nutrição, fisioterapia, endocrinologia e nutrologia no estúdio, conversando com o seu treino.",
    },
    {
      title: "Ambiente premium",
      text: "Espaço climatizado, café de cortesia, toalha gelada, cadeira de massagem e bota de recovery.",
    },
  ],
  closing:
    "Limite de 400 alunos. Isso não é limitação, é escolha: ninguém aqui é apenas mais um.",
  cta: "Agendar minha aula grátis",
} as const;

export const howItWorks = {
  kicker: "COMO FUNCIONA",
  title: "Três passos até o seu *primeiro treino*.",
  steps: [
    {
      title: "Agende pelo WhatsApp",
      text: "Mande uma mensagem e escolha o horário da sua aula experimental grátis.",
    },
    {
      title: "Aula e avaliação",
      text: "Você treina com a gente e faz a avaliação de entrada: bioimpedância e avaliação biomecânica.",
    },
    {
      title: "Plano individual",
      text: "Seu professor monta o treino para o seu objetivo. Turmas de no máximo 4 alunos, com iniciantes e avançados juntos e o treino adaptado a cada um.",
    },
  ],
} as const;

export const modalities = {
  kicker: "MODALIDADES",
  title: "Do treino completo ao *treino expresso*.",
  items: [
    {
      name: "Fitburn Class",
      tag: "Até 60 min",
      text: "Sessões de musculação de até 60 minutos, com 1 professor para cada 4 alunos e treino adaptado às suas metas.",
    },
    {
      name: "Fitburn Express",
      tag: "Até 30 min · desde 5h30",
      text: "Para quem tem agenda apertada: musculação de até 30 minutos, a partir das 5h30, com 1 professor para cada 4 alunos. Você começa o dia treinado.",
    },
  ],
  photoAlt:
    "Pequeno grupo de alunos treinando com halteres enquanto um professor acompanha cada movimento",
} as const;

export const healthTeam = {
  kicker: "EQUIPE DE SAÚDE",
  title: "O seu treino *não fica sozinho*.",
  lead: "Especialistas no mesmo endereço do seu treino, falando a mesma língua do seu professor.",
  items: [
    {
      title: "Nutrição",
      text: "Plano alimentar alinhado à sua rotina e aos seus treinos, com acompanhamento próximo.",
    },
    {
      title: "Fisioterapia",
      text: "Prevenção, reabilitação e performance, com técnicas como o Método Busquet, integradas ao seu treino.",
    },
    {
      title: "Endocrinologia e Nutrologia",
      text: "Avaliação de exames e do histórico clínico, integrada ao treino e à nutrição.",
    },
  ],
} as const;

export const amenities = {
  kicker: "ESTRUTURA",
  title: "Treinar bem começa no *ambiente*.",
  items: [
    { label: "Espaço climatizado", icon: "wind" },
    { label: "Café de cortesia", icon: "coffee" },
    { label: "Toalha gelada durante o treino", icon: "droplet" },
    { label: "Cadeira de massagem", icon: "armchair" },
    { label: "Bota de recovery", icon: "boot" },
  ],
  photos: [
    {
      slot: "estrutura-1",
      alt: "Salão de musculação com piso escuro e equipamentos alinhados",
    },
    {
      slot: "estrutura-2",
      alt: "Toalha dobrada e garrafa de água ao lado de um banco de treino",
    },
    { slot: "estrutura-3", alt: "Rack com halteres organizados por peso" },
    { slot: "estrutura-4", alt: "Poltrona de massagem em uma sala de descanso" },
  ],
} as const;

export const plans = {
  kicker: "PLANOS",
  title: "Seu plano é montado *na conversa*.",
  text: "Os planos são apresentados depois da sua aula grátis, conforme o seu objetivo e a sua rotina.",
  subtitle: "No plano anual você tem:",
  benefits: [
    "Avaliação de bioimpedância",
    "Sessão de massagem relaxante",
    "Trancamento de plano",
    "Avaliação nutricional",
    "Eventos exclusivos do Fitburn",
  ],
  cta: "Conhecer os planos",
} as const;

export const faqSection = {
  kicker: "DÚVIDAS",
  title: "Perguntas *frequentes*.",
  more: "Não achou sua dúvida?",
  cta: "Fale com a gente no WhatsApp",
} as const;

export const visit = {
  kicker: "AULA EXPERIMENTAL",
  title: "Sua primeira aula é *por nossa conta*.",
  lead: "Mande uma mensagem, escolha o horário e venha conhecer o estúdio.",
  primary: "Agendar minha aula grátis",
  secondary: "Ligar agora",
  addressLabel: "Endereço",
  phonesLabel: "Telefones",
  hoursLabel: "Horários",
  whatsappLabel: "WhatsApp",
  phoneLabel: "Telefone",
  mapTitle:
    "Mapa: Fitburn Brasil, Rua Ilacir Pereira Lima, 166, Silveira, Belo Horizonte",
  mapLink: "Abrir no Google Maps",
} as const;

export const footer = {
  copyright: "© 2026 Fitburn Brasil",
  socialLabels: {
    instagram: "Fitburn Brasil no Instagram (abre em nova aba)",
    facebook: "Fitburn Brasil no Facebook (abre em nova aba)",
    youtube: "Fitburn Brasil no YouTube (abre em nova aba)",
  },
} as const;

export const actionBar = {
  label: "Ações rápidas",
  whatsapp: "WhatsApp",
  phone: "Ligar",
} as const;

export const notFound = {
  title: "Página não encontrada | Fitburn Brasil",
  heading: "Página não encontrada",
  text: "O endereço que você abriu não existe.",
  link: "Voltar ao início",
} as const;
