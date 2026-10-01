/**
 * Massa estática da demonstração: tudo fictício.
 *
 * Nada aqui é uma credencial: as senhas vêm do ambiente (ver o README). Os
 * e-mails usam o domínio reservado `.example`, que não recebe e-mail.
 */

/** CPF fictício com os dígitos verificadores corretos (formato válido, número inventado). */
export function fakeCpf(seed) {
  let n = (Math.imul(seed + 17, 2654435761) >>> 0) % 900_000_000;
  n += 100_000_000;
  const digits = String(n).split("").map(Number);
  if (digits.every((d) => d === digits[0])) digits[8] = (digits[8] + 1) % 10;
  const check = (list) => {
    const factor = list.length + 1;
    const sum = list.reduce((acc, d, i) => acc + d * (factor - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(digits);
  const d2 = check([...digits, d1]);
  const all = [...digits, d1, d2].join("");
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

// ---------------------------------------------------------------- perfis e equipe

const V = ["VIEW"];

/** Mesmos perfis do seed de design (`pnpm design:seed`), para os dois conviverem. */
export const PROFILES = {
  professor: {
    name: "Professor",
    description: "Conduz aulas, registra presença e acompanha os próprios alunos.",
    access: [
      ["DASHBOARD", V, "ALL"],
      ["OCORRENCIAS", V, "ASSIGNED_CLASSES"],
      ["PRESENCA", ["VIEW", "EXECUTE"], "ASSIGNED_CLASSES"],
      ["CLIENTES", V, "ASSIGNED_CLIENTS"],
      ["FICHAS_DE_TREINO", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLIENTS"],
      ["GAMIFICACAO", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLIENTS"],
    ],
  },
  reception: {
    name: "Recepção",
    /** Nomes alternativos já usados em outros ambientes (ver docs/demo-data-checklist.md). */
    aliases: ["Funcionário administrativo"],
    description: "Reservas, clientes e planos.",
    access: [
      ["DASHBOARD", V, "ALL"],
      ["TEMPLATES_DE_AULA", V, "ALL"],
      ["OCORRENCIAS", V, "ALL"],
      ["RESERVAS", ["VIEW", "CREATE", "EDIT"], "ALL"],
      ["CLIENTES", ["VIEW", "CREATE", "EDIT"], "ALL"],
      ["PLANOS", ["VIEW", "CREATE", "EDIT"], "ALL"],
      ["GAMIFICACAO", V, "ALL"],
    ],
  },
};

export const STAFF = [
  {
    key: "camila",
    name: "Camila Andrade",
    email: "camila.andrade@fitburn.example",
    role: "professor",
  },
  {
    key: "rafael",
    name: "Rafael Nogueira",
    email: "rafael.nogueira@fitburn.example",
    role: "professor",
  },
  { key: "aline", name: "Aline Rocha", email: "aline.rocha@fitburn.example", role: "professor" },
  { key: "bianca", name: "Bianca Leal", email: "bianca.leal@fitburn.example", role: "reception" },
];

// ---------------------------------------------------------------- catálogo

export const MODALITIES = [
  { name: "Treino Funcional", description: "Circuito de exercícios multiarticulares" },
  { name: "Spinning", description: "Aula em bicicleta ergométrica, alta intensidade" },
  { name: "Yoga", description: "Prática de posturas, respiração e relaxamento" },
  { name: "Muay Thai", description: "Arte marcial tailandesa, condicionamento físico" },
];

/** Os nomes batem com os do seed de design: quem já rodou aquele seed reaproveita os templates. */
export const TEMPLATES = [
  {
    name: "Treino Funcional",
    modality: "Treino Funcional",
    duration: 50,
    capacity: 12,
    teacher: "camila",
    description:
      "Treino funcional em circuito, com estímulos de força e resistência e adaptações para todos os níveis.",
  },
  {
    name: "Spinning 45min",
    modality: "Spinning",
    duration: 45,
    capacity: 14,
    teacher: "rafael",
    description: "Pedal em ritmo de intervalos.",
  },
  {
    name: "Yoga suave",
    modality: "Yoga",
    duration: 60,
    capacity: 12,
    teacher: "aline",
    description: "Yoga leve para mobilidade e foco.",
  },
  {
    name: "Muay Thai iniciante",
    modality: "Muay Thai",
    duration: 60,
    capacity: 10,
    teacher: "rafael",
    description: "Fundamentos do Muay Thai para iniciantes.",
  },
];

/**
 * Grade semanal (0 = domingo ... 6 = sábado): manhã, almoço e 18h/19h, com
 * capacidades variadas. Domingo não tem aula.
 */
export const TIMETABLE = {
  1: [
    { time: "07:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "12:00", template: "Spinning 45min", teacher: "rafael", capacity: 14 },
    { time: "18:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "19:00", template: "Muay Thai iniciante", teacher: "rafael", capacity: 10 },
  ],
  2: [
    { time: "07:00", template: "Yoga suave", teacher: "aline", capacity: 10 },
    { time: "12:00", template: "Treino Funcional", teacher: "camila", capacity: 10 },
    { time: "18:00", template: "Spinning 45min", teacher: "rafael", capacity: 14 },
    { time: "19:00", template: "Muay Thai iniciante", teacher: "rafael", capacity: 10 },
  ],
  3: [
    { time: "07:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "12:00", template: "Spinning 45min", teacher: "rafael", capacity: 14 },
    { time: "18:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "19:00", template: "Yoga suave", teacher: "aline", capacity: 12 },
  ],
  4: [
    { time: "07:00", template: "Spinning 45min", teacher: "rafael", capacity: 14 },
    { time: "12:00", template: "Yoga suave", teacher: "aline", capacity: 10 },
    { time: "18:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "19:00", template: "Muay Thai iniciante", teacher: "rafael", capacity: 10 },
  ],
  5: [
    { time: "07:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "12:00", template: "Spinning 45min", teacher: "rafael", capacity: 14 },
    { time: "18:00", template: "Yoga suave", teacher: "aline", capacity: 12 },
  ],
  6: [
    { time: "09:00", template: "Treino Funcional", teacher: "camila", capacity: 12 },
    { time: "10:30", template: "Yoga suave", teacher: "aline", capacity: 12 },
  ],
};

/** Horários "de academia" usados para as aulas de hoje (a ao vivo e a do começo do dia). */
export const TODAY_SLOTS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:30",
  "12:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

// ---------------------------------------------------------------- planos

export const PLANS = [
  {
    name: "Plano Performance",
    description:
      "Acesso ilimitado a todas as modalidades, prioridade em reservas e acompanhamento mensal com o professor.",
  },
  {
    name: "Plano Essencial",
    description: "Acesso a Spinning, Yoga e Funcional, com até 3 aulas por semana.",
  },
];

// ---------------------------------------------------------------- clientes

/**
 * Colegas do Guilherme. `pattern` é a presença nas aulas do histórico dele, da
 * mais recente (primeiro caractere) para a mais antiga: P presente, A faltou,
 * "." sem reserva. Quem tem menos "P" fica atrás dele no ranking.
 */
export const OTHER_CLIENTS = [
  {
    key: "larissa",
    name: "Larissa Mendonça",
    email: "larissa.mendonca@fitburn.example",
    phone: "(11) 99120-4401",
    birthDate: "1985-11-27",
    address: "Rua Harmonia, 310, Vila Madalena, São Paulo/SP",
    plan: { name: "Plano Performance", start: -75, end: 40 },
    pattern: "PPPPPPPP.PPPPPP",
  },
  {
    key: "otavio",
    name: "Otávio Ribeiro",
    email: "otavio.ribeiro@fitburn.example",
    phone: "(11) 99120-4402",
    birthDate: "1974-05-09",
    address: "Rua Cardeal Arcoverde, 88, Pinheiros, São Paulo/SP",
    plan: { name: "Plano Performance", start: -45, end: 45 },
    pattern: "PPP.PPPPPP.PPPA",
  },
  {
    key: "marina",
    name: "Marina Albuquerque",
    email: "marina.albuquerque@fitburn.example",
    phone: "(11) 99120-4403",
    birthDate: "1992-03-14",
    address: "Rua das Acácias, 120, Vila Madalena, São Paulo/SP",
    plan: { name: "Plano Essencial", start: -30, end: 60 },
    pattern: "PP.PPPP.PPPP.PP",
  },
  {
    key: "thiago",
    name: "Thiago Bastos",
    email: "thiago.bastos@fitburn.example",
    phone: "(11) 99120-4404",
    birthDate: "1997-08-02",
    address: "Alameda dos Ipês, 45, apto 82, Pinheiros, São Paulo/SP",
    plan: { name: "Plano Essencial", start: -20, end: 70 },
    pattern: "PPPP.PPP.P.....",
  },
  {
    key: "juliana",
    name: "Juliana Prado",
    email: "juliana.prado@fitburn.example",
    phone: "(11) 99120-4405",
    birthDate: "1999-01-21",
    address: "Rua Fradique Coutinho, 502, Pinheiros, São Paulo/SP",
    plan: { name: "Plano Essencial", start: -50, end: 40 },
    pattern: "P.PA.PP.P.PA.P.",
  },
  {
    key: "fernando",
    name: "Fernando Cavalcanti",
    email: "fernando.cavalcanti@fitburn.example",
    phone: "(11) 99120-4406",
    birthDate: "1981-09-30",
    address: "Rua Mourato Coelho, 77, Vila Madalena, São Paulo/SP",
    plan: { name: "Plano Essencial", start: -15, end: 75 },
    pattern: ".PPP.P.PP..P.P.",
  },
  {
    key: "beatriz",
    name: "Beatriz Nakamura",
    email: "beatriz.nakamura@fitburn.example",
    phone: "(11) 99120-4407",
    birthDate: "1994-06-18",
    address: "Rua Aspicuelta, 205, Vila Madalena, São Paulo/SP",
    plan: { name: "Plano Performance", start: -10, end: 80 },
    pattern: "PP.P.PPP.P.P...",
  },
  {
    key: "gustavo",
    name: "Gustavo Farias",
    email: "gustavo.farias@fitburn.example",
    phone: "(11) 99120-4408",
    birthDate: "1989-12-05",
    address: "Rua Wisard, 410, Vila Madalena, São Paulo/SP",
    plan: { name: "Plano Performance", start: -25, end: 65 },
    pattern: "P.P..PP.P..P.PP",
  },
  {
    key: "camilaD",
    name: "Camila Duarte",
    email: "camila.duarte@fitburn.example",
    phone: "(11) 99120-4409",
    birthDate: "1995-12-08",
    address: "Rua Aspicuelta, 305, Vila Madalena, São Paulo/SP",
    plan: { name: "Plano Essencial", start: -60, end: 30 },
    pattern: "..PPP.P.PP.PP.P",
  },
  {
    key: "rodrigo",
    name: "Rodrigo Teixeira",
    email: "rodrigo.teixeira@fitburn.example",
    phone: "(11) 99120-4410",
    birthDate: "1990-04-17",
    address: "Rua Joaquim Antunes, 150, Pinheiros, São Paulo/SP",
    plan: null,
    pattern: "PP.P..PPP...P..",
  },
];

/** Dados do protagonista quando o script precisa criá-lo (o nome e o e-mail podem ser trocados por env). */
export const PROTAGONIST_DEFAULTS = {
  phone: "(11) 98765-4321",
  birthDate: "1991-07-18",
  address: "Rua Oscar Freire, 1234, apto 52, Jardins, São Paulo/SP",
};

/**
 * Presença do protagonista nas aulas do histórico, da mais recente (k = 0) para
 * a mais antiga: 9 presenças seguidas (o streak de agora, que a aula ao vivo
 * leva a 10), uma falta corrigida (presente que virou falta, com estorno), 3
 * presenças, uma falta e o resto presente.
 *
 *   P presente · C presente corrigido para falta (aparece o estorno) · A faltou
 */
export function protagonistMark(k) {
  if (k <= 8) return "P";
  if (k === 9) return "C";
  if (k >= 10 && k <= 12) return "P";
  if (k === 13) return "A";
  return "P";
}

// ---------------------------------------------------------------- histórico

/** Aulas do histórico do protagonista: uma por segunda, quarta e sexta, para trás a partir de hoje. */
export const HISTORY_BY_WEEKDAY = {
  1: {
    template: "Treino Funcional",
    time: "07:00",
    teacher: "camila",
    capacity: 12,
    alt: ["08:00", "09:00"],
  },
  3: {
    template: "Spinning 45min",
    time: "12:00",
    teacher: "rafael",
    capacity: 14,
    alt: ["13:00", "11:00"],
  },
  5: {
    template: "Yoga suave",
    time: "18:00",
    teacher: "aline",
    capacity: 12,
    alt: ["17:00", "16:00"],
  },
};

/** Aula extra do histórico (terça ou quinta, à noite): o protagonista cancelou; quatro colegas treinaram. */
export const CANCELLED_CLASS = {
  template: "Muay Thai iniciante",
  time: "19:00",
  teacher: "rafael",
  capacity: 10,
  alt: ["20:00", "17:30"],
  attendees: ["larissa", "otavio", "juliana", "rodrigo"],
};

// ---------------------------------------------------------------- metas e fichas

export const PROTAGONIST_GOALS = [
  {
    title: "Frequentar 12 aulas no mês",
    description: "Constância é o que traz resultado: 12 aulas em 30 dias.",
    completed: true,
    due: -5,
  },
  {
    title: "Experimentar 3 modalidades diferentes",
    description: "Treino Funcional, Spinning e Yoga.",
    completed: true,
    due: -12,
  },
  {
    title: "Chegar a 10 presenças seguidas",
    description: "Falta pouco: mantenha a sequência e libere o badge de 10.",
    completed: false,
    due: 14,
  },
];

export const PROTAGONIST_SHEETS = [
  {
    title: "Fase 1: adaptação",
    status: "COMPLETED",
    notes: "Base de técnica e mobilidade. Concluída.",
    exercises: [
      { name: "Agachamento com apoio", sets: "3", reps: "12" },
      { name: "Remada baixa", sets: "3", reps: "12", load: "20kg" },
      { name: "Caminhada leve", duration: "10 min" },
    ],
  },
  {
    title: "Fase 2: força e condicionamento",
    status: "ACTIVE",
    notes:
      "Foco em força de membros inferiores e core. Hidratar bem e respeitar o descanso entre as séries.",
    exercises: [
      {
        name: "Agachamento livre",
        sets: "4",
        reps: "10",
        load: "40kg",
        notes: "Pés na largura dos ombros; descer até 90 graus com a coluna neutra.",
      },
      {
        name: "Supino reto",
        sets: "3",
        reps: "12",
        load: "30kg",
        notes: "Controlar a descida (3 segundos).",
      },
      {
        name: "Remada curvada",
        sets: "3",
        reps: "12",
        load: "25kg",
        notes: "Cotovelos junto ao corpo.",
      },
      {
        name: "Prancha",
        sets: "3",
        duration: "45s",
        notes: "Core contraído durante toda a série.",
      },
    ],
  },
];

/** Uma ficha curta para dois colegas, só para a tela de fichas do professor não ficar vazia. */
export const OTHER_SHEETS = {
  larissa: {
    title: "Performance: bloco A",
    status: "ACTIVE",
    exercises: [
      { name: "Levantamento terra romeno", sets: "4", reps: "8", load: "30kg" },
      { name: "Afundo", sets: "3", reps: "10", notes: "Dez repetições por perna." },
    ],
  },
  marina: {
    title: "Mobilidade e core",
    status: "ACTIVE",
    exercises: [
      { name: "Ponte glútea", sets: "3", reps: "15" },
      { name: "Bird-dog", sets: "3", reps: "10" },
    ],
  },
};

export const OTHER_GOALS = {
  larissa: { title: "Frequentar 3 aulas na mesma semana", completed: true },
  marina: { title: "Completar 5 aulas de Yoga neste mês", completed: false },
};
