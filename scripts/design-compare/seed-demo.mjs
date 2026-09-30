#!/usr/bin/env node
/**
 * Massa de dados de DEMONSTRAÇÃO (temporária) para a comparação com o design.
 *
 * Fala só com a API (o admin criado por `prisma:seed`) e pode ser rodado de
 * novo: o que já existe (por nome/e-mail) é reaproveitado. Os dados seguem os
 * textos dos artboards do Claude Design (Marina Souza, Plano Performance,
 * Treino Funcional 18h00, Muay Thai lotada...).
 *
 * NÃO use em produção. Todas as contas criadas usam a senha do admin inicial
 * (INITIAL_ADMIN_PASSWORD do .env), então nenhuma credencial vai para o repo.
 *
 *   pnpm design:seed            # API em http://localhost:3333/api
 *   API_URL=http://localhost:3333/api node scripts/design-compare/seed-demo.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, loadEnv, gymToday, addDays, weekdayOf, DEMO } from "./lib/env.mjs";

const env = loadEnv();
const API = process.env.API_URL ?? `http://localhost:${env.PORT ?? 3333}/api`;
const PASSWORD = env.INITIAL_ADMIN_PASSWORD;
if (!PASSWORD || !env.INITIAL_ADMIN_EMAIL) {
  console.error("INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD ausentes no .env da raiz.");
  process.exit(1);
}

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const login = async (email) =>
  (await call("POST", "/auth/login", { body: { email, password: PASSWORD } })).accessToken;

const log = (...a) => console.log("[seed]", ...a);

// ---------------------------------------------------------------- admin
const adminToken = await login(env.INITIAL_ADMIN_EMAIL);
const admin = (m, p, o = {}) => call(m, p, { token: adminToken, ...o });

const users = await admin("GET", "/users");
const adminUser = users.find((u) => u.email === env.INITIAL_ADMIN_EMAIL);
if (adminUser && adminUser.fullName !== DEMO.adminName) {
  await admin("PATCH", `/users/${adminUser.id}`, { body: { fullName: DEMO.adminName } });
}

// ---------------------------------------------------------------- perfis
let profiles = await admin("GET", "/profiles");
async function ensureProfile(name, description, access) {
  let p = profiles.find((x) => x.name === name);
  if (!p) {
    p = await admin("POST", "/profiles", { body: { name, description } });
    log("perfil", name);
  }
  for (const [module, actions, scope] of access) {
    await admin("PUT", `/profiles/${p.id}/module-access/${module}`, { body: { actions, scope } });
  }
  return p;
}
const V = ["VIEW"];
const professor = await ensureProfile(
  "Professor",
  "Conduz aulas, registra presença e acompanha os próprios alunos.",
  [
    ["DASHBOARD", V, "ALL"],
    ["OCORRENCIAS", V, "ASSIGNED_CLASSES"],
    ["PRESENCA", ["VIEW", "EXECUTE"], "ASSIGNED_CLASSES"],
    ["CLIENTES", V, "ASSIGNED_CLIENTS"],
    ["FICHAS_DE_TREINO", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLIENTS"],
    ["GAMIFICACAO", ["VIEW", "CREATE", "EDIT"], "ASSIGNED_CLIENTS"],
  ],
);
const recepcao = await ensureProfile("Recepção", "Reservas, clientes e planos.", [
  ["DASHBOARD", V, "ALL"],
  ["TEMPLATES_DE_AULA", V, "ALL"],
  ["OCORRENCIAS", V, "ALL"],
  ["RESERVAS", ["VIEW", "CREATE", "EDIT"], "ALL"],
  ["CLIENTES", ["VIEW", "CREATE", "EDIT"], "ALL"],
  ["PLANOS", ["VIEW", "CREATE", "EDIT"], "ALL"],
  ["GAMIFICACAO", V, "ALL"],
]);

// ---------------------------------------------------------------- equipe
async function ensureStaff(fullName, email, profileId) {
  const list = await admin("GET", "/users");
  let u = list.find((x) => x.email === email);
  if (!u) {
    u = await admin("POST", "/users/staff", {
      body: { fullName, email, password: PASSWORD, profileId },
    });
    log("equipe", fullName);
  }
  return u;
}
const staff = {};
for (const s of DEMO.staff) {
  staff[s.key] = await ensureStaff(
    s.name,
    s.email,
    s.role === "recepcao" ? recepcao.id : professor.id,
  );
}
if (staff.thiago.status !== "INACTIVE") {
  await admin("POST", `/users/${staff.thiago.id}/deactivate`).catch(() => {});
}

// ---------------------------------------------------------------- catálogo
const mods = await admin("GET", "/modalities");
const modality = {};
for (const m of DEMO.modalities) {
  let found = mods.find((x) => x.name === m.name);
  if (!found)
    found = await admin("POST", "/modalities", {
      body: { name: m.name, description: m.description },
    });
  modality[m.name] = found;
}
const tpls = await admin("GET", "/class-templates");
const template = {};
for (const t of DEMO.templates) {
  let found = tpls.find((x) => x.name === t.name);
  if (!found) {
    found = await admin("POST", "/class-templates", {
      body: {
        name: t.name,
        description: t.description,
        durationMinutes: t.duration,
        capacity: t.capacity,
        modalityId: modality[t.modality].id,
        defaultInstructorId: staff[t.instructor].id,
      },
    });
    log("template", t.name);
  }
  template[t.name] = found;
}

// ---------------------------------------------------------------- clientes
const existingClients = await admin("GET", "/users");
const client = {};
for (const c of DEMO.clients) {
  let u = existingClients.find((x) => x.email === c.email);
  if (!u) {
    u = await admin("POST", "/users/clients", {
      body: {
        fullName: c.name,
        email: c.email,
        phone: c.phone,
        birthDate: c.birthDate,
        document: c.document,
        address: c.address,
        password: PASSWORD,
      },
    });
    log("cliente", c.name);
  }
  client[c.key] = u;
}

// ---------------------------------------------------------------- planos
const plans = await admin("GET", "/plans");
const plan = {};
for (const p of DEMO.plans) {
  let found = plans.find((x) => x.name === p.name);
  if (!found)
    found = await admin("POST", "/plans", { body: { name: p.name, description: p.description } });
  plan[p.name] = found;
}
for (const a of DEMO.planAssignments) {
  const history = await admin("GET", `/plan-assignments?clientId=${client[a.client].id}`).catch(
    () => null,
  );
  const already = Array.isArray(history)
    ? history.some((h) => h.plan?.name === a.plan && h.startDate === a.start)
    : false;
  if (already) continue;
  try {
    await admin("POST", "/plan-assignments", {
      body: {
        clientId: client[a.client].id,
        planId: plan[a.plan].id,
        startDate: a.start,
        endDate: a.end,
      },
    });
    log("plano", a.client, a.plan);
  } catch (e) {
    log("plano falhou", a.client, a.plan, e.message);
  }
}

// ---------------------------------------------------------------- inativos
for (const key of DEMO.inactiveClients) {
  await admin("POST", `/clients/${client[key].id}/deactivate`).catch(() => {});
}

// ---------------------------------------------------------------- atribuições
for (const [teacher, clients] of Object.entries(DEMO.assignments)) {
  for (const k of clients) {
    await admin("POST", "/assignments", {
      body: { teacherId: staff[teacher].id, clientId: client[k].id },
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------- grade da semana
const today = gymToday();
const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
const until = addDays(monday, 27);
const weekStart = addDays(monday, 0);
const existingWeek = await admin("GET", `/occurrences?from=${weekStart}&to=${until}`);
if (existingWeek.length === 0) {
  for (const s of DEMO.series) {
    try {
      await admin("POST", "/occurrences/recurring", {
        body: {
          templateId: template[s.template].id,
          weekdays: s.weekdays,
          startTime: s.time,
          startDate: monday,
          endDate: until,
          instructorId: s.instructor ? staff[s.instructor].id : undefined,
          capacity: s.capacity,
        },
      });
      log("série", s.template, s.time);
    } catch (e) {
      log("série falhou", s.template, s.time, e.message);
    }
  }
}
// Dias já passados desta semana (quando a grade foi criada em outra ocasião).
if (monday < today) {
  const past = await admin("GET", `/occurrences?from=${monday}&to=${addDays(today, -1)}`);
  if (!past.some((o) => o.name === "Spinning 45min")) {
    for (const s of DEMO.series) {
      await admin("POST", "/occurrences/recurring", {
        body: {
          templateId: template[s.template].id,
          weekdays: s.weekdays,
          startTime: s.time,
          startDate: monday,
          endDate: addDays(today, -1),
          instructorId: s.instructor ? staff[s.instructor].id : undefined,
          capacity: s.capacity,
        },
      }).catch((e) => log("grade passada", s.template, e.message.slice(0, 120)));
    }
  }
}
const grade = await admin("GET", `/occurrences?from=${monday}&to=${until}`);
const findOcc = (name, date, time) =>
  grade.find((o) => o.name === name && o.startsAt.startsWith(gymToUtcPrefix(date, time)));
function gymToUtcPrefix(date, time) {
  // America/Sao_Paulo = UTC-3 (sem horário de verão desde 2019).
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCHours(h + 3, m);
  return d.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------- reservas do cliente Marina (upcoming)
const marinaToken = await login(client.marina.email);
async function reserve(token, occurrenceId) {
  try {
    return await call("POST", "/reservations", {
      token,
      body: { occurrenceId },
      headers: { "Idempotency-Key": randomUUID() },
    });
  } catch (e) {
    if (e.status !== 409 && e.status !== 422) log("reserva falhou", e.message);
    return null;
  }
}
const adminReserve = (clientId, occurrenceId) =>
  admin("POST", "/admin/reservations", {
    body: { clientId, occurrenceId },
    headers: { "Idempotency-Key": randomUUID() },
  }).catch((e) => {
    if (e.status !== 409) log("reserva admin falhou", e.message);
    return null;
  });

const next = (weekday, from = today) => {
  let d = from;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
};
// "Hoje 18h00 Treino Funcional", "Quinta 07h00 Spinning", "Sábado 09h00 Yoga"
const marinaTargets = [
  findOcc("Treino Funcional", today, "18:00"),
  findOcc("Spinning 45min", next(4, addDays(today, 1)), "07:00"),
  findOcc("Yoga suave", next(6, addDays(today, 1)), "09:00"),
].filter(Boolean);
for (const occ of marinaTargets) await reserve(marinaToken, occ.id);

// Muay Thai de hoje: capacidade pequena e cheia (a agenda mostra "lotada").
const muayToday = findOcc("Muay Thai iniciante", today, "19:00");
if (muayToday) {
  await admin("PATCH", `/occurrences/${muayToday.id}`, { body: { capacity: 3 } }).catch(() => {});
  for (const k of ["camilaF", "rafaelA", "juliana"]) await adminReserve(client[k].id, muayToday.id);
}
// Treino Funcional de hoje: mais alguns alunos além da Marina.
const tfToday = findOcc("Treino Funcional", today, "18:00");
if (tfToday) {
  await admin("PATCH", `/occurrences/${tfToday.id}`, { body: { capacity: 12 } }).catch(() => {});
  for (const k of ["camilaF", "rafaelA", "juliana", "anaPaula", "brunoA"])
    await adminReserve(client[k].id, tfToday.id);
}
// Spinning de amanhã / Yoga: figurantes.
const spinTomorrow = findOcc("Spinning 45min", addDays(today, 1), "12:00");
if (spinTomorrow)
  for (const k of ["camilaF", "anaPaula"]) await adminReserve(client[k].id, spinTomorrow.id);

// ---------------------------------------------------------------- histórico (presenças e pontos)
const require = createRequire(path.join(ROOT, "packages/api/package.json"));
async function shiftOccurrence(id, date, time, durationMinutes) {
  const { Client } = require("pg");
  const db = new Client({ connectionString: (env.DATABASE_URL ?? "").replace(/\?schema=.*$/, "") });
  await db.connect();
  try {
    const [h, m] = time.split(":").map(Number);
    const startsAt = new Date(`${date}T00:00:00Z`);
    startsAt.setUTCHours(h + 3, m); // America/Sao_Paulo = UTC-3
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    await db.query('UPDATE class_occurrences SET "startsAt" = $2, "endsAt" = $3 WHERE id = $1', [
      id,
      startsAt,
      endsAt,
    ]);
  } finally {
    await db.end();
  }
}
// Cria a aula no futuro (dá para reservar), reserva, move para o passado e marca a presença.
const historyState = await admin(
  "GET",
  `/occurrences?from=${addDays(today, -30)}&to=${addDays(today, -1)}`,
);
const alreadyHistory = historyState.filter((o) => o.name === "Treino Funcional").length >= 10;
if (!alreadyHistory) {
  // 13 aulas diárias às 06:00 (dias -13 a -1) + 3 extras às 05:00 nos 3 dias mais recentes.
  const slots = [];
  for (let d = 13; d >= 1; d--) slots.push({ date: addDays(today, -d), time: "06:00" });
  for (let d = 3; d >= 1; d--) slots.push({ date: addDays(today, -d), time: "05:00" });
  // índice 0 = mais recente
  const ordered = slots.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  let futureDay = addDays(today, 60);
  const attendance = DEMO.attendance;
  let i = 0;
  for (const slot of ordered) {
    const plannedDate = futureDay;
    futureDay = addDays(futureDay, 1);
    const occ = await admin("POST", "/occurrences", {
      body: {
        templateId: template["Treino Funcional"].id,
        date: plannedDate,
        startTime: "06:00",
        instructorId: staff.rafael.id,
        capacity: 12,
      },
    }).catch((e) => {
      log("aula histórica falhou", e.message);
      return null;
    });
    if (!occ) continue;
    const reservations = [];
    for (const [key, pattern] of Object.entries(attendance)) {
      const mark = pattern[i];
      if (!mark) continue;
      const r = await adminReserve(client[key].id, occ.id);
      if (r) reservations.push({ id: r.id, mark });
    }
    // A API não deixa mudar o horário de uma aula com reservas: este é o único
    // ponto em que o script escreve direto no banco de teste.
    await shiftOccurrence(occ.id, slot.date, slot.time, occ.durationMinutes);
    for (const r of reservations) {
      await admin("POST", `/attendance/reservations/${r.id}`, {
        body: { status: r.mark === "P" ? "PRESENT" : "ABSENT" },
      }).catch((e) => log("presença falhou", e.message));
    }
    i++;
  }
  log("histórico criado:", i, "aulas");
}

// ---------------------------------------------------------------- metas e fichas (professor Rafael)
const rafaelToken = await login(staff.rafael.email);
const teacher = (m, p, o = {}) => call(m, p, { token: rafaelToken, ...o });

const goals = await teacher("GET", `/goals?clientId=${client.marina.id}`).catch(() => []);
if (Array.isArray(goals) && goals.length === 0) {
  for (const g of DEMO.goals) {
    const created = await teacher("POST", "/goals", {
      body: {
        clientId: client.marina.id,
        title: g.title,
        description: g.description,
        dueDate: g.dueDate,
      },
    }).catch((e) => {
      log("meta falhou", e.message);
      return null;
    });
    if (created && g.completed)
      await teacher("POST", `/goals/${created.id}/complete`).catch((e) =>
        log("concluir meta", e.message),
      );
  }
}

const sheets = await teacher("GET", `/workout-sheets?clientId=${client.marina.id}`).catch(() => []);
if (Array.isArray(sheets) && sheets.length === 0) {
  for (const s of DEMO.sheets) {
    await teacher("POST", "/workout-sheets", { body: { clientId: client.marina.id, ...s } }).catch(
      (e) => log("ficha falhou", e.message),
    );
  }
}

log("pronto. Contas (senha = INITIAL_ADMIN_PASSWORD do .env):");
log("  admin       ", env.INITIAL_ADMIN_EMAIL);
log("  professor   ", staff.rafael.email);
log("  cliente     ", client.marina.email);
