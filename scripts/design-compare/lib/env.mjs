import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Lê o .env da raiz (KEY="valor"), sem depender de dotenv. */
export function loadEnv() {
  const file = path.join(ROOT, ".env");
  const out = {};
  if (!fs.existsSync(file)) return { ...process.env };
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return { ...out, ...process.env };
}

// ---------------------------------------------------------------- datas (fuso da academia)
export function gymToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = domingo ... 6 = sábado. */
export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// ---------------------------------------------------------------- massa da demonstração
// Nomes, planos, horários e números vêm dos artboards do Claude Design.
export const DEMO = {
  adminName: "Guilherme Faglioni",
  staff: [
    { key: "rafael", name: "Rafael Andrade", email: "rafael.prof@fitburn.example", role: "professor" },
    { key: "camila", name: "Camila Lopes", email: "camila.prof@fitburn.example", role: "professor" },
    { key: "diego", name: "Diego Costa", email: "diego.prof@fitburn.example", role: "professor" },
    { key: "aline", name: "Aline Rocha", email: "aline.prof@fitburn.example", role: "professor" },
    { key: "ana", name: "Ana Moraes", email: "ana.prof@fitburn.example", role: "professor" },
    { key: "bianca", name: "Bianca Souza", email: "bianca.recepcao@fitburn.example", role: "recepcao" },
    { key: "thiago", name: "Thiago Nunes", email: "thiago.prof@fitburn.example", role: "professor" },
  ],
  modalities: [
    { name: "Spinning", description: "Aula em bicicleta ergométrica, alta intensidade" },
    { name: "Yoga", description: "Prática de posturas, respiração e relaxamento" },
    { name: "Treino Funcional", description: "Circuito de exercícios multiarticulares" },
    { name: "Muay Thai", description: "Arte marcial tailandesa, condicionamento físico" },
  ],
  templates: [
    { name: "Spinning 45min", modality: "Spinning", duration: 45, capacity: 15, instructor: "camila", description: "Pedal em ritmo de intervalos." },
    { name: "Yoga suave", modality: "Yoga", duration: 60, capacity: 12, instructor: "aline", description: "Yoga leve para mobilidade e foco." },
    { name: "Treino Funcional", modality: "Treino Funcional", duration: 50, capacity: 10, instructor: "rafael", description: "Treino funcional em circuito, com estímulos de força e resistência e adaptações para todos os níveis." },
    { name: "Muay Thai iniciante", modality: "Muay Thai", duration: 60, capacity: 14, instructor: "diego", description: "Fundamentos do Muay Thai para iniciantes." },
  ],
  clients: [
    { key: "marina", name: "Marina Souza", email: "marina.souza@email.com", phone: "(31) 99876-5432", birthDate: "1994-03-14", document: "123.456.789-00", address: "Rua das Palmeiras, 220 · Bairro Silveira · Belo Horizonte/MG" },
    { key: "rafaelA", name: "Rafael Andrade", email: "rafael.andrade@email.com", phone: "(11) 99123-4455", birthDate: "1990-05-02", document: "111.222.333-01", address: "Rua Augusta, 1200, São Paulo/SP" },
    { key: "camilaF", name: "Camila Ferreira", email: "camila.ferreira@email.com", phone: "(11) 97788-2233", birthDate: "1993-07-19", document: "111.222.333-02", address: "Av. Paulista, 900, São Paulo/SP" },
    { key: "brunoL", name: "Bruno Lima", email: "bruno.lima@email.com", phone: "(11) 96654-1122", birthDate: "1988-11-23", document: "111.222.333-03", address: "Rua Oscar Freire, 310, São Paulo/SP" },
    { key: "juliana", name: "Juliana Prado", email: "juliana.prado@email.com", phone: "(11) 95566-7788", birthDate: "1999-01-21", document: "111.222.333-04", address: "Rua Fradique Coutinho, 502, São Paulo/SP" },
    { key: "diegoM", name: "Diego Martins", email: "diego.martins@email.com", phone: "(11) 94433-5566", birthDate: "1985-09-30", document: "111.222.333-05", address: "Rua Mourato Coelho, 77, São Paulo/SP" },
    { key: "anaPaula", name: "Ana Paula Ribeiro", email: "ana.paula@email.com", phone: "(11) 93322-1100", birthDate: "1991-02-11", document: "111.222.333-06", address: "Rua Harmonia, 310, São Paulo/SP" },
    { key: "brunoA", name: "Bruno Alves", email: "bruno.alves@email.com", phone: "(11) 92211-0099", birthDate: "1987-06-05", document: "111.222.333-07", address: "Rua Wisard, 410, São Paulo/SP" },
    { key: "camilaD", name: "Camila Duarte", email: "camila.duarte@email.com", phone: "(11) 91100-9988", birthDate: "1995-12-08", document: "111.222.333-08", address: "Rua Aspicuelta, 205, São Paulo/SP" },
    { key: "diegoR", name: "Diego Ramos", email: "diego.ramos@email.com", phone: "(11) 90099-8877", birthDate: "1992-04-17", document: "111.222.333-09", address: "Rua Cardeal Arcoverde, 88, São Paulo/SP" },
  ],
  inactiveClients: ["brunoL", "diegoM"],
  plans: [
    { name: "Plano Performance", description: "Acesso ilimitado a todas as modalidades, prioridade em reservas e acompanhamento mensal com o professor." },
    { name: "Plano Essencial", description: "Acesso a Spinning, Yoga e Funcional, com até 3 aulas por semana." },
    { name: "Plano Experimental (7 dias)", description: "Uma semana para conhecer o estúdio." },
  ],
  // Em ordem cronológica: atribuir um plano novo encerra o anterior.
  planAssignments: [
    { client: "marina", plan: "Plano Experimental (7 dias)", start: "2026-02-01", end: "2026-02-07" },
    { client: "marina", plan: "Plano Essencial", start: "2026-02-15", end: "2026-08-14" },
    { client: "marina", plan: "Plano Performance", start: "2026-08-15", end: "2026-11-15" },
    { client: "camilaF", plan: "Plano Performance", start: "2026-08-01", end: "2026-11-01" },
    { client: "rafaelA", plan: "Plano Essencial", start: "2026-07-01", end: "2026-12-31" },
    { client: "juliana", plan: "Plano Essencial", start: "2026-08-10", end: "2026-12-10" },
    { client: "anaPaula", plan: "Plano Performance", start: "2026-06-01", end: "2026-12-01" },
    { client: "brunoA", plan: "Plano Performance", start: "2026-06-15", end: "2026-12-15" },
    { client: "camilaD", plan: "Plano Essencial", start: "2026-07-15", end: "2026-12-15" },
    { client: "diegoR", plan: "Plano Essencial", start: "2026-08-20", end: "2026-12-20" },
  ],
  assignments: { rafael: ["marina", "camilaF", "juliana"] },
  series: [
    { template: "Spinning 45min", weekdays: [1, 2, 3, 4, 5], time: "07:00", instructor: "camila", capacity: 12 },
    { template: "Spinning 45min", weekdays: [1, 2, 3, 4, 5], time: "12:00", instructor: "camila", capacity: 12 },
    { template: "Treino Funcional", weekdays: [1, 2, 3, 4, 5], time: "18:00", instructor: "rafael", capacity: 12 },
    { template: "Muay Thai iniciante", weekdays: [1, 2, 3, 4], time: "19:00", instructor: "diego", capacity: 10 },
    { template: "Yoga suave", weekdays: [5], time: "19:00", instructor: "aline", capacity: 12 },
    { template: "Yoga suave", weekdays: [6], time: "09:00", instructor: "ana", capacity: 12 },
  ],
  // Presenças do histórico: do mais recente (índice 0) ao mais antigo. P presente, A faltou, . sem reserva.
  attendance: Object.fromEntries(
    Object.entries({
      anaPaula: "PPPPPPPPPPPPPPPPPP",
      marina: "P.PPPPPPPPPPPPPPP",
      brunoA: "PP.PPPPPPPPPPPPP.",
      camilaD: "PPPP.P.P.P.P.P",
      diegoR: "..PPP..P.P.P",
      camilaF: "P.P.P.P.P.P.P.P",
      rafaelA: ".P.P.P.P.P",
      juliana: "PPA..PP.A.PP",
    }).map(([k, v]) => [k, [...v].map((c) => (c === "." ? null : c))]),
  ),
  goals: [
    { title: "Frequentar 12 aulas no mês", description: "9 de 12 aulas concluídas", dueDate: "2026-09-30" },
    { title: "Manter sequência de 15 dias", description: "12 de 15 dias consecutivos", dueDate: "2026-10-05" },
    { title: "Experimentar 3 modalidades diferentes", description: "3 de 3 modalidades", dueDate: "2026-09-02", completed: true },
  ],
  sheets: [
    {
      title: "Fase 2",
      status: "ACTIVE",
      notes: "Foco em força de membros inferiores e core.",
      exercises: [
        { name: "Agachamento livre", sets: "4", reps: "10", load: "40kg", notes: "Manter os pés na largura dos ombros, descer até 90°." },
        { name: "Supino reto", sets: "3", reps: "12", load: "30kg", notes: "Controlar a fase excêntrica." },
        { name: "Remada curvada", sets: "3", reps: "12", load: "25kg" },
        { name: "Prancha", sets: "3", duration: "45s", notes: "Manter o core contraído durante toda a série." },
      ],
    },
    { title: "Fase 1", status: "COMPLETED", exercises: [{ name: "Agachamento com apoio", sets: "3", reps: "12" }, { name: "Remada baixa", sets: "3", reps: "12", load: "20kg" }] },
    { title: "Avaliação inicial", status: "ARCHIVED", exercises: [{ name: "Caminhada leve", duration: "10 min" }] },
  ],
};
