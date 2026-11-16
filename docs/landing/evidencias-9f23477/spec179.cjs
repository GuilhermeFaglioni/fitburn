// Confronta o HTML renderizado (dist/index.html) com os textos exatos da seção 5 da GH #179.
const fs = require("fs"), path = require("path");
const W = "/home/agentes/agentes/faglionidev/dev-0407cf65/repos/GuilhermeFaglioni/fitburn-landing/packages/landing";
const { parse } = require(path.join(W, "node_modules/node-html-parser"));
const html = fs.readFileSync(path.join(W, "dist/index.html"), "utf8");
const root = parse(html);
root.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
const norm = (s) => s.replace(/\s+/g, " ").trim();
// blocos de texto: cada elemento folha de texto
const blocks = [];
(function walk(n) {
  if (n.nodeType === 3) return;
  const kids = n.childNodes || [];
  const hasEl = kids.some((k) => k.nodeType === 1 && !["EM", "SPAN", "STRONG", "A", "B", "I"].includes((k.tagName || "").toUpperCase()));
  if (!hasEl) { const t = norm(n.text || ""); if (t) blocks.push({ tag: (n.tagName || "").toLowerCase(), t }); return; }
  kids.forEach(walk);
})(root);
const sr = [...root.querySelectorAll(".sr-only,.visually-hidden")].map((n) => norm(n.text));
const spec = [
  // 5.1
  "Pular para o conteúdo", "Como funciona", "Modalidades", "Estrutura", "Dúvidas", "Contato", "Agendar aula grátis",
  // 5.2
  "ESTÚDIO DE MUSCULAÇÃO · SILVEIRA, BH", "Chega de treinar sozinho.", "Musculação com 1 professor para cada 4 alunos, no Silveira.",
  "Avaliação de entrada, treino individual e no máximo 400 alunos no estúdio. A primeira aula é por nossa conta.",
  "Agendar minha aula grátis", "Ligar agora", "Seg a sex, 5h30 às 22h · sáb, 8h às 12h",
  // 5.3
  "1:4", "professor para cada 4 alunos", "400", "alunos no máximo, por escolha", "5h30", "o primeiro treino do dia", "2", "avaliações de entrada: bioimpedância e biomecânica",
  // 5.4
  "NÃO SOMOS UMA ACADEMIA COMUM", "Não é promessa. É estrutura.",
  "Acompanhamento real", "Um professor para cada 4 alunos. Seu treino é corrigido, ajustado e evoluído em cada sessão, sem fila e sem esperar a sua vez.",
  "Avaliação antes do primeiro treino", "Bioimpedância e avaliação biomecânica individuais. Seu plano é feito para o seu corpo, não para uma turma genérica.",
  "Saúde no mesmo lugar", "Nutrição, fisioterapia, endocrinologia e nutrologia no estúdio, conversando com o seu treino.",
  "Ambiente premium", "Espaço climatizado, café de cortesia, toalha gelada, cadeira de massagem e bota de recovery.",
  "Limite de 400 alunos. Isso não é limitação, é escolha: ninguém aqui é apenas mais um.",
  // 5.5
  "COMO FUNCIONA", "Três passos até o seu primeiro treino.",
  "Agende pelo WhatsApp", "Mande uma mensagem e escolha o horário da sua aula experimental grátis.",
  "Aula e avaliação", "Você treina com a gente e faz a avaliação de entrada: bioimpedância e avaliação biomecânica.",
  "Plano individual", "Seu professor monta o treino para o seu objetivo. Turmas de no máximo 4 alunos, com iniciantes e avançados juntos e o treino adaptado a cada um.",
  // 5.6
  "MODALIDADES", "Do treino completo ao treino expresso.", "Fitburn Class", "Fitburn Express", "Até 60 min", "Até 30 min · desde 5h30",
  "Sessões de musculação de até 60 minutos, com 1 professor para cada 4 alunos e treino adaptado às suas metas.",
  "Para quem tem agenda apertada: musculação de até 30 minutos, a partir das 5h30, com 1 professor para cada 4 alunos. Você começa o dia treinado.",
  // 5.7
  "EQUIPE DE SAÚDE", "O seu treino não fica sozinho.", "Especialistas no mesmo endereço do seu treino, falando a mesma língua do seu professor.",
  "Nutrição", "Plano alimentar alinhado à sua rotina e aos seus treinos, com acompanhamento próximo.",
  "Fisioterapia", "Prevenção, reabilitação e performance, com técnicas como o Método Busquet, integradas ao seu treino.",
  "Endocrinologia e Nutrologia", "Avaliação de exames e do histórico clínico, integrada ao treino e à nutrição.",
  // 5.8
  "ESTRUTURA", "Treinar bem começa no ambiente.", "Espaço climatizado", "Café de cortesia", "Toalha gelada durante o treino", "Cadeira de massagem", "Bota de recovery",
  // 5.9
  "PLANOS", "Seu plano é montado na conversa.", "Os planos são apresentados depois da sua aula grátis, conforme o seu objetivo e a sua rotina.",
  "No plano anual você tem:", "Avaliação de bioimpedância", "Sessão de massagem relaxante", "Trancamento de plano", "Avaliação nutricional", "Eventos exclusivos do Fitburn", "Conhecer os planos",
  // 5.10
  "DÚVIDAS", "Perguntas frequentes.",
  "A primeira aula é grátis?", "Sim. A aula experimental é gratuita. Agende pelo WhatsApp e escolha o melhor horário para você.",
  "Preciso ter experiência?", "Não. As turmas são heterogêneas: iniciantes, intermediários e avançados treinam juntos, e o treino é adaptado individualmente para cada um.",
  "Como são as turmas?", "No máximo 4 alunos por professor, em sala climatizada.",
  "Não compareci à minha aula. Posso repor?", "Sim. A reposição é agendada pelos nossos canais de atendimento, sujeita à disponibilidade de vaga e horário na semana em vigor.",
  "Quais as formas de pagamento?", "Cartão de crédito, débito, Pix e dinheiro. O pagamento é feito na recepção do estúdio.",
  "Quais as vantagens do plano anual?", "Avaliação de bioimpedância, sessão de massagem relaxante, trancamento de plano, avaliação nutricional e participação em eventos exclusivos do Fitburn.",
  "Como funciona o cancelamento do plano?", "Pode ser pedido a qualquer momento, pessoalmente, desde que as mensalidades estejam em dia. As condições contratuais estão disponíveis na recepção.",
  "Não achou sua dúvida?", "Fale com a gente no WhatsApp",
  // 5.11
  "AULA EXPERIMENTAL", "Sua primeira aula é por nossa conta.", "Mande uma mensagem, escolha o horário e venha conhecer o estúdio.",
  "Rua Ilacir Pereira Lima, 166, Loja 04", "Silveira, Belo Horizonte, MG", "CEP 31140-540", "(31) 9 8514-1034", "(31) 3567-8819",
  "Segunda a sexta", "05:30 às 22:00", "Sábado", "08:00 às 12:00", "Abrir no Google Maps",
  // 5.12
  "Rua Ilacir Pereira Lima, 166, Loja 04 · Silveira, Belo Horizonte, MG · CEP 31140-540", "© 2026 Fitburn Brasil",
  // 5.13
  "WhatsApp", "Ligar",
];
const all = norm(root.text);
const missing = []; let cursor = 0; const outOfOrder = [];
for (const s of spec) {
  const i = all.indexOf(s);
  if (i < 0) { missing.push(s); continue; }
}
// ordem das seções (kickers + H2)
const order = ["ESTÚDIO DE MUSCULAÇÃO", "NÃO SOMOS UMA ACADEMIA", "COMO FUNCIONA", "MODALIDADES", "EQUIPE DE SAÚDE", "ESTRUTURA", "PLANOS", "DÚVIDAS", "AULA EXPERIMENTAL", "© 2026"];
let last = -1; const ordOk = order.map((o) => { const i = all.indexOf(o, last + 1); const ok = i > last; if (ok) last = i; return [o, ok]; });
// texto renderizado sem correspondência na spec
const covered = (t) => spec.some((s) => s.includes(t) || t.includes(s));
const extra = blocks.filter((b) => !covered(b.t));
const forbidden = ["10 anos", "Fitburn Zone", "R$", "mais completo", "o melhor", "garantid", "Clique aqui", "Saiba mais", "Laguna", "seo Muniz", "Link112", "nachegada", "emcadasessão", "massageme"].filter((f) => all.includes(f));
const h1 = root.querySelectorAll("h1").map((h) => norm(h.text));
const h2 = root.querySelectorAll("h2").map((h) => norm(h.text));
const out = [];
out.push(`strings da spec conferidas: ${spec.length}; ausentes no HTML renderizado: ${missing.length}`);
missing.forEach((m) => out.push("  AUSENTE: " + m));
out.push("ordem das seções: " + ordOk.map(([o, ok]) => `${o}=${ok ? "ok" : "FORA DE ORDEM"}`).join("; "));
out.push("H1 (" + h1.length + "): " + h1[0]);
out.push("H2: " + JSON.stringify(h2));
out.push("textos proibidos presentes: " + (forbidden.length ? forbidden.join(", ") : "nenhum"));
out.push(`blocos de texto renderizados sem correspondência na spec (${extra.length}):`);
extra.forEach((b) => out.push(`  <${b.tag}> ${b.t}`));
out.push("title: " + norm(root.querySelector("title").text) + " (" + norm(root.querySelector("title").text).length + " chars)");
console.log(out.join("\n"));
fs.writeFileSync("/home/agentes/agentes/faglionidev/dev-0407cf65/screenshots/179-audit/spec-confronto.txt", out.join("\n"));
