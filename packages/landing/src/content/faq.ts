export interface FaqItem {
  question: string;
  answer: string;
}

/** Perguntas e respostas: a mesma fonte para o HTML e para o JSON-LD FAQPage. */
export const faq: readonly FaqItem[] = [
  {
    question: "A primeira aula é grátis?",
    answer:
      "Sim. A aula experimental é gratuita. Agende pelo WhatsApp e escolha o melhor horário para você.",
  },
  {
    question: "Preciso ter experiência?",
    answer:
      "Não. As turmas são heterogêneas: iniciantes, intermediários e avançados treinam juntos, e o treino é adaptado individualmente para cada um.",
  },
  {
    question: "Como são as turmas?",
    answer: "No máximo 4 alunos por professor, em sala climatizada.",
  },
  {
    question: "Não compareci à minha aula. Posso repor?",
    answer:
      "Sim. A reposição é agendada pelos nossos canais de atendimento, sujeita à disponibilidade de vaga e horário na semana em vigor.",
  },
  {
    question: "Quais as formas de pagamento?",
    answer:
      "Cartão de crédito, débito, Pix e dinheiro. O pagamento é feito na recepção do estúdio.",
  },
  {
    question: "Quais as vantagens do plano anual?",
    answer:
      "Avaliação de bioimpedância, sessão de massagem relaxante, trancamento de plano, avaliação nutricional e participação em eventos exclusivos do Fitburn.",
  },
  {
    question: "Como funciona o cancelamento do plano?",
    answer:
      "Pode ser pedido a qualquer momento, pessoalmente, desde que as mensalidades estejam em dia. As condições contratuais estão disponíveis na recepção.",
  },
];
