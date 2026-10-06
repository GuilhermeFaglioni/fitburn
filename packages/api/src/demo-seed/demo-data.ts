/**
 * Massa estática da demonstração remota: tudo fictício. Nada aqui é
 * credencial — a senha das contas vem de DEMO_USER_PASSWORD (ver demo-seed.ts).
 * Os e-mails usam o domínio reservado `.example` (não recebe e-mail) e os
 * CPFs são inventados (formato válido, números fictícios).
 */

export const DEMO_EMAIL_DOMAIN = "fitburn.example";

/** Única modalidade/aula do estúdio. */
export const PERSONAL_CLASS = {
  modality: {
    name: "Personal Class",
    description: "Aula personalizada conduzida por um professor.",
  },
  template: {
    name: "Personal Class",
    description: "Treino personalizado, com acompanhamento direto do professor.",
    durationMinutes: 60,
    capacity: 3,
  },
} as const;

export type StaffRole = "professor" | "admin";

/**
 * Equipe de demonstração: professores fictícios. A Personal Class existe para
 * vários professores ao mesmo tempo (aulas simultâneas só de professores
 * diferentes). Troque `role` para "admin" para transformar alguém em
 * administrador (perfil de sistema) em vez de professor.
 */
export const STAFF: Array<{ key: string; fullName: string; email: string; role: StaffRole }> = [
  {
    key: "camila.andrade",
    fullName: "Camila Andrade",
    role: "professor",
    email: `camila.andrade@${DEMO_EMAIL_DOMAIN}`,
  },
  {
    key: "rafael.nogueira",
    fullName: "Rafael Nogueira",
    role: "professor",
    email: `rafael.nogueira@${DEMO_EMAIL_DOMAIN}`,
  },
  {
    key: "aline.rocha",
    fullName: "Aline Rocha",
    role: "professor",
    email: `aline.rocha@${DEMO_EMAIL_DOMAIN}`,
  },
  {
    key: "marcos.pereira",
    fullName: "Marcos Pereira",
    role: "professor",
    email: `marcos.pereira@${DEMO_EMAIL_DOMAIN}`,
  },
];

export const PROFESSOR_PROFILE = {
  name: "Professor",
  description: "Conduz aulas, registra presença e acompanha os próprios alunos.",
  access: [
    ["DASHBOARD", ["VIEW"], "ALL"],
    ["TEMPLATES_DE_AULA", ["VIEW"], "ALL"],
    ["OCORRENCIAS", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLASSES"],
    ["PRESENCA", ["VIEW", "EXECUTE"], "ASSIGNED_CLASSES"],
    ["CLIENTES", ["VIEW"], "ASSIGNED_CLIENTS"],
    ["FICHAS_DE_TREINO", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLIENTS"],
    ["GAMIFICACAO", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLIENTS"],
  ],
} as const;

export const PLANS = [
  {
    name: "Plano Performance",
    description:
      "Aulas ilimitadas de Personal Class, prioridade nas reservas e acompanhamento mensal com o professor.",
  },
  {
    name: "Plano Essencial",
    description: "Até 3 aulas de Personal Class por semana.",
  },
];

/**
 * `frequency`: chance de ter aula num dia útil. `slots`: horários preferidos.
 * Quem tem frequência alta forma sequências de presença (streak, badges).
 */
export const CLIENTS: Array<{
  key: string;
  fullName: string;
  frequency: number;
  period: "morning" | "evening" | "any";
  plan: "Plano Performance" | "Plano Essencial";
}> = [
  {
    key: "guilherme",
    fullName: "Guilherme Faglioni",
    frequency: 0.85,
    period: "evening",
    plan: "Plano Performance",
  },
  {
    key: "wilson",
    fullName: "Wilson Faglioni Junior",
    frequency: 0.7,
    period: "morning",
    plan: "Plano Performance",
  },
  {
    key: "lara",
    fullName: "Lara Faglioni",
    frequency: 0.75,
    period: "evening",
    plan: "Plano Performance",
  },
  {
    key: "danielle",
    fullName: "Danielle Faglioni",
    frequency: 0.65,
    period: "morning",
    plan: "Plano Performance",
  },
  {
    key: "marina",
    fullName: "Marina Costa",
    frequency: 0.7,
    period: "evening",
    plan: "Plano Performance",
  },
  {
    key: "thiago",
    fullName: "Thiago Almeida",
    frequency: 0.6,
    period: "morning",
    plan: "Plano Essencial",
  },
  {
    key: "beatriz",
    fullName: "Beatriz Souza",
    frequency: 0.55,
    period: "evening",
    plan: "Plano Essencial",
  },
  {
    key: "felipe",
    fullName: "Felipe Martins",
    frequency: 0.5,
    period: "any",
    plan: "Plano Essencial",
  },
  {
    key: "camila",
    fullName: "Camila Ribeiro",
    frequency: 0.6,
    period: "morning",
    plan: "Plano Performance",
  },
  {
    key: "rodrigo",
    fullName: "Rodrigo Pacheco",
    frequency: 0.45,
    period: "evening",
    plan: "Plano Essencial",
  },
  {
    key: "juliana",
    fullName: "Juliana Prado",
    frequency: 0.55,
    period: "morning",
    plan: "Plano Essencial",
  },
  {
    key: "lucas",
    fullName: "Lucas Teixeira",
    frequency: 0.4,
    period: "any",
    plan: "Plano Essencial",
  },
  {
    key: "fernanda",
    fullName: "Fernanda Lopes",
    frequency: 0.7,
    period: "evening",
    plan: "Plano Performance",
  },
  {
    key: "gustavo",
    fullName: "Gustavo Barros",
    frequency: 0.35,
    period: "evening",
    plan: "Plano Essencial",
  },
];

/** Horários (hora local da academia) em que há Personal Class; cada uma dura 60 min. */
export const SLOTS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];
/** Horários nobres: todos os professores atendem (várias Personal Class ao mesmo tempo). */
export const PRIME_SLOTS = new Set(["07:00", "12:00", "18:00", "19:00"]);
/** Sábado só de manhã. */
export const SATURDAY_SLOTS = new Set(["08:00", "09:00", "10:00", "11:00", "12:00"]);
export const MORNING_SLOTS = new Set(["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"]);

export const WORKOUT_TEMPLATES = [
  {
    title: "Treino A — Inferiores e core",
    notes: "Descanso de 60 a 90 segundos entre as séries. Foque na técnica antes da carga.",
    exercises: [
      { name: "Agachamento livre", sets: "4", reps: "12", load: "30kg" },
      { name: "Afundo com halteres", sets: "3", reps: "10 por perna", load: "12kg" },
      { name: "Stiff", sets: "3", reps: "12", load: "25kg" },
      { name: "Prancha abdominal", sets: "3", duration: "45s" },
    ],
  },
  {
    title: "Treino B — Superiores",
    notes: "Mantenha a escápula estável nos exercícios de empurrar.",
    exercises: [
      { name: "Supino reto", sets: "4", reps: "10", load: "40kg" },
      { name: "Remada curvada", sets: "4", reps: "10", load: "30kg" },
      { name: "Desenvolvimento com halteres", sets: "3", reps: "12", load: "10kg" },
      { name: "Rosca direta", sets: "3", reps: "12", load: "8kg" },
      { name: "Tríceps na polia", sets: "3", reps: "15", load: "20kg" },
    ],
  },
  {
    title: "Treino C — Condicionamento",
    notes: "Circuito: 40s de esforço e 20s de pausa. Ritmo forte, mas controlado.",
    exercises: [
      { name: "Burpee", sets: "4", duration: "40s" },
      { name: "Kettlebell swing", sets: "4", duration: "40s", load: "16kg" },
      { name: "Corrida na esteira", sets: "1", distance: "2km" },
      { name: "Mountain climber", sets: "4", duration: "40s" },
    ],
  },
];

export const ACTIVE_GOALS = [
  {
    title: "Treinar 3 vezes por semana",
    description: "Manter a constância durante o próximo mês.",
  },
  { title: "Agachar com 40kg", description: "Evoluir a carga mantendo a técnica." },
  { title: "Correr 5km sem parar", description: "Melhorar o condicionamento cardiovascular." },
  { title: "Melhorar a mobilidade de quadril", description: "Alongamento diário de 10 minutos." },
];
export const COMPLETED_GOALS = [
  {
    title: "Completar o primeiro mês de treino",
    description: "Concluído com frequência acima de 80%.",
  },
  { title: "Dominar a técnica do agachamento", description: "Avaliado pelo professor." },
];

/** CPF fictício com dígitos verificadores corretos (formato válido, número inventado). */
export function fakeCpf(seed: number): string {
  let n = (Math.imul(seed + 17, 2654435761) >>> 0) % 900_000_000;
  n += 100_000_000;
  const digits = String(n).split("").map(Number);
  if (digits.every((d) => d === digits[0])) digits[8] = (digits[8] + 1) % 10;
  const check = (list: number[]): number => {
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
