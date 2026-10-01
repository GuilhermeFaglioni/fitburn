#!/usr/bin/env node
/**
 * Massa de dados de DEMONSTRAÇÃO para gravar um vídeo da tela, com o cliente
 * Guilherme Faglioni como protagonista. SÓ PARA AMBIENTE LOCAL.
 *
 *   pnpm demo:seed:guilherme
 *
 * Leia scripts/demo-seed/README.md antes: ele explica o que o script cria, as
 * variáveis de ambiente (API_URL, DEMO_CLIENT_NAME, DEMO_CLIENT_EMAIL,
 * DEMO_CLIENT_PASSWORD, DEMO_SEED_ALLOW_REMOTE) e as limitações.
 *
 * Como funciona, em uma frase: tudo passa pela API (como o admin do
 * `prisma:seed`, o professor e a recepção), com UMA exceção: as aulas do
 * histórico são criadas no futuro (onde dá para reservar), recebem as reservas e
 * são movidas para o passado com um UPDATE direto no Postgres local, porque a
 * API (de propósito) não deixa reservar nem mudar o horário de aula que já
 * passou. Só depois disso o professor registra a presença, pela API.
 *
 * É idempotente: rodar de novo reaproveita por nome/e-mail/horário e só cria o
 * que faltar.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, loadEnv } from "../design-compare/lib/env.mjs";
import { ApiError, createApi, idempotency } from "./lib/api.mjs";
import {
  CANCELLED_CLASS,
  HISTORY_BY_WEEKDAY,
  MODALITIES,
  OTHER_CLIENTS,
  OTHER_GOALS,
  OTHER_SHEETS,
  PLANS,
  PROFILES,
  PROTAGONIST_DEFAULTS,
  PROTAGONIST_GOALS,
  PROTAGONIST_SHEETS,
  STAFF,
  TEMPLATES,
  TIMETABLE,
  TODAY_SLOTS,
  fakeCpf,
  protagonistMark,
} from "./lib/data.mjs";
import {
  addDays,
  brDate,
  gymDateTimeToUtc,
  gymNow,
  shortDay,
  toMinutes,
  utcToGym,
  weekdayOf,
} from "./lib/time.mjs";

// ================================================================ utilidades

const log = (...args) => console.log(...args);
const step = (title) => log(`\n== ${title}`);
const note = (text) => log(`   ${text}`);
const warnings = [];
const warn = (text) => {
  warnings.push(text);
  log(`   [aviso] ${text}`);
};

function fail(message) {
  console.error(`\n[demo-seed] ERRO: ${message}\n`);
  process.exit(1);
}

const stats = { created: {}, reused: {} };
const made = (kind, n = 1) => {
  stats.created[kind] = (stats.created[kind] ?? 0) + n;
};
const kept = (kind, n = 1) => {
  stats.reused[kind] = (stats.reused[kind] ?? 0) + n;
};

const normalize = (text) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Roda `fn`; se a API recusar, avisa e segue (devolve null). Erros inesperados continuam subindo. */
async function soft(label, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      warn(`${label}: ${error.message}`);
      return null;
    }
    throw error;
  }
}

// ================================================================ ambiente e travas de segurança

const env = loadEnv();
const NODE_ENV = (env.NODE_ENV ?? "").toLowerCase();
const ALLOW_REMOTE = env.DEMO_SEED_ALLOW_REMOTE === "true";
const API_URL = (env.API_URL ?? `http://localhost:${env.PORT ?? 3333}/api`).replace(/\/+$/, "");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
const isLocalHost = (hostname) => LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");

function hostOf(url, label) {
  try {
    return new URL(url);
  } catch {
    return fail(`${label} inválida: "${url}".`);
  }
}

if (NODE_ENV === "production") {
  fail(
    "NODE_ENV=production. Este script popula dados de DEMONSTRAÇÃO e escreve direto no banco: " +
      "ele só roda em ambiente local (NODE_ENV=development).",
  );
}

const apiHost = hostOf(API_URL, "API_URL").hostname;
const databaseUrl = (env.DATABASE_URL ?? "").replace(/\?.*$/, "");
if (!databaseUrl) fail("DATABASE_URL ausente (.env da raiz): o passo de histórico precisa dele.");
const dbUrl = hostOf(databaseUrl, "DATABASE_URL");

if (!ALLOW_REMOTE && (!isLocalHost(apiHost) || !isLocalHost(dbUrl.hostname))) {
  fail(
    `API_URL (${apiHost}) ou DATABASE_URL (${dbUrl.hostname}) não é local. O passo de histórico ` +
      "ESCREVE DIRETO NO BANCO (UPDATE em class_occurrences) e a massa é fictícia: não use contra " +
      "um ambiente compartilhado ou de produção. Se você tem certeza de que é um ambiente descartável, " +
      "rode com DEMO_SEED_ALLOW_REMOTE=true.",
  );
}
if (ALLOW_REMOTE) {
  log(
    "[aviso] DEMO_SEED_ALLOW_REMOTE=true: o script vai escrever direto no banco apontado por DATABASE_URL.",
  );
}

const ADMIN_EMAIL = env.INITIAL_ADMIN_EMAIL;
const ADMIN_PASSWORD = env.INITIAL_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  fail("INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD ausentes no .env da raiz (rode o prisma:seed).");
}

const CLIENT_NAME = (env.DEMO_CLIENT_NAME ?? "Guilherme Faglioni").trim();
const CLIENT_EMAIL = (env.DEMO_CLIENT_EMAIL ?? "guilherme.faglioni@fitburn.example").trim();
const PASSWORD_FROM_ENV = Boolean(env.DEMO_CLIENT_PASSWORD);
const PASSWORD = env.DEMO_CLIENT_PASSWORD || ADMIN_PASSWORD;
const PASSWORD_SOURCE = PASSWORD_FROM_ENV
  ? "a variável DEMO_CLIENT_PASSWORD"
  : "a mesma INITIAL_ADMIN_PASSWORD do .env";
if (PASSWORD.length < 8)
  fail("A senha das contas de demonstração precisa ter ao menos 8 caracteres.");

log("[demo-seed] Massa de demonstração (protagonista: " + CLIENT_NAME + ")");
log(`[demo-seed] API:   ${API_URL}`);
log(
  `[demo-seed] Banco: ${dbUrl.hostname}:${dbUrl.port || 5432}${dbUrl.pathname} (escrita direta só no passo de histórico)`,
);

const api = createApi(API_URL);
try {
  await api.request("GET", "/health");
} catch (error) {
  fail(`${error.message}\nSuba a API antes (pnpm dev:api) e confira a API_URL.`);
}

const admin = api.session(ADMIN_EMAIL, ADMIN_PASSWORD);
try {
  await admin.login();
} catch (error) {
  fail(
    `Login do administrador (${ADMIN_EMAIL}) falhou: ${error.message}\n` +
      "Rode `pnpm --filter @fitburn/api prisma:seed` e confira INITIAL_ADMIN_* no .env.",
  );
}

// ================================================================ datas de referência

const today = gymNow().date;
const nowMinutes = () => gymNow().minutes;
const FUTURE_DAYS = 14;
log(`[demo-seed] Hoje (fuso da academia): ${shortDay(today)} ${today}, ${gymNow().time}`);

// ================================================================ perfis e equipe

step("Perfis e equipe");

async function ensureProfile(definition) {
  const names = [definition.name, ...(definition.aliases ?? [])].map(normalize);
  const list = await admin.call("GET", "/profiles");
  let profile = list.find((p) => names.includes(normalize(p.name)));
  const isNew = !profile;
  if (profile) {
    kept("perfis");
  } else {
    profile = await admin.call("POST", "/profiles", {
      body: { name: definition.name, description: definition.description },
    });
    made("perfis");
    note(`perfil criado: ${definition.name}`);
  }
  // Garante só o que a demo precisa (professor: presença; recepção: reservas...), sem tirar nada.
  const detail = await admin.call("GET", `/profiles/${profile.id}`);
  for (const [module, actions, scope] of definition.access) {
    const current = detail.moduleAccess.find((m) => m.module === module);
    const have = new Set(current?.actions ?? []);
    if (actions.every((a) => have.has(a))) continue;
    await admin.call("PUT", `/profiles/${profile.id}/module-access/${module}`, {
      body: {
        actions: [...new Set([...have, ...actions])],
        scope: current?.actions?.length ? current.scope : scope,
      },
    });
    if (!isNew) note(`permissão ${module} ajustada no perfil ${profile.name}`);
  }
  return profile;
}

const professorProfile = await ensureProfile(PROFILES.professor);
const receptionProfile = await ensureProfile(PROFILES.reception);

const staff = {};
{
  const users = await admin.call("GET", "/users");
  for (const def of STAFF) {
    const profile = def.role === "reception" ? receptionProfile : professorProfile;
    let user =
      users.find((u) => u.email.toLowerCase() === def.email) ??
      users.find(
        (u) => normalize(u.fullName) === normalize(def.name) && u.profile?.id === profile.id,
      );
    if (user) {
      kept("equipe");
      if (user.status === "INACTIVE") await admin.call("POST", `/users/${user.id}/reactivate`);
    } else {
      user = await admin.call("POST", "/users/staff", {
        body: { fullName: def.name, email: def.email, password: PASSWORD, profileId: profile.id },
      });
      made("equipe");
      note(`equipe criada: ${def.name} (${def.role === "reception" ? "recepção" : "professor"})`);
    }
    staff[def.key] = { ...def, id: user.id, email: user.email };
  }
}

// Sessões dos professores (para registrar presença, metas e fichas pela API).
// Se a conta já existia com outra senha, cai para o administrador e avisa.
const sessions = {};
async function sessionOf(key) {
  if (sessions[key]) return sessions[key];
  const s = api.session(staff[key].email, PASSWORD);
  try {
    await s.login();
    sessions[key] = s;
  } catch {
    warn(
      `Não consegui entrar como ${staff[key].name} (${staff[key].email}) com a senha de demonstração: ` +
        "as ações dela serão feitas pelo administrador.",
    );
    sessions[key] = admin;
  }
  return sessions[key];
}

// ================================================================ catálogo (modalidades, templates)

step("Modalidades e templates de aula");

const modalities = {};
{
  const list = await admin.call("GET", "/modalities");
  for (const def of MODALITIES) {
    let found = list.find((m) => normalize(m.name) === normalize(def.name));
    if (found) {
      kept("modalidades");
      if (!found.isActive) await admin.call("POST", `/modalities/${found.id}/activate`);
    } else {
      found = await admin.call("POST", "/modalities", {
        body: { name: def.name, description: def.description },
      });
      made("modalidades");
      note(`modalidade criada: ${def.name}`);
    }
    modalities[def.name] = found;
  }
}

const templates = {};
{
  const list = await admin.call("GET", "/class-templates");
  for (const def of TEMPLATES) {
    let found = list.find((t) => normalize(t.name) === normalize(def.name));
    if (found) {
      kept("templates");
      if (!found.isActive) await admin.call("POST", `/class-templates/${found.id}/activate`);
    } else {
      found = await admin.call("POST", "/class-templates", {
        body: {
          name: def.name,
          description: def.description,
          durationMinutes: def.duration,
          capacity: def.capacity,
          modalityId: modalities[def.modality].id,
          defaultInstructorId: staff[def.teacher].id,
        },
      });
      made("templates");
      note(`template criado: ${def.name}`);
    }
    templates[def.name] = found;
  }
}

// ================================================================ clientes

step("Clientes");

const clientList = await admin.call("GET", "/clients");

/** Cria ou reaproveita um cliente (por nome, depois por e-mail). Nunca mexe na senha de quem já existe. */
async function ensureClient({ name, email, phone, birthDate, address }, seed) {
  const byName = clientList.filter((c) => normalize(c.fullName) === normalize(name));
  let found =
    byName.find((c) => c.email.toLowerCase() === email.toLowerCase()) ??
    byName.find((c) => c.status === "ACTIVE") ??
    byName[0];
  if (!found) {
    const sameEmail = clientList.find((c) => c.email.toLowerCase() === email.toLowerCase());
    if (sameEmail) {
      return { ...sameEmail, existed: true, emailClash: true };
    }
    let lastError;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const created = await admin.call("POST", "/clients", {
          body: {
            fullName: name,
            email,
            phone,
            birthDate,
            document: fakeCpf(seed + attempt * 101),
            address,
            password: PASSWORD,
          },
        });
        made("clientes");
        const row = {
          id: created.id,
          fullName: created.fullName,
          email: created.email,
          status: "ACTIVE",
          existed: false,
        };
        clientList.push(row);
        return row;
      } catch (error) {
        lastError = error;
        // CPF repetido: tenta o próximo. Qualquer outra recusa é definitiva.
        if (!(error instanceof ApiError) || error.status !== 409) break;
      }
    }
    throw lastError;
  }
  kept("clientes");
  if (found.status === "INACTIVE") {
    await admin.call("POST", `/clients/${found.id}/reactivate`);
    note(`${found.fullName} estava inativo: reativado`);
  }
  return { ...found, existed: true };
}

const protagonist = await ensureClient(
  { name: CLIENT_NAME, email: CLIENT_EMAIL, ...PROTAGONIST_DEFAULTS },
  1,
);
if (protagonist.emailClash) {
  fail(
    `O e-mail ${CLIENT_EMAIL} já pertence a "${protagonist.fullName}", não a ${CLIENT_NAME}. ` +
      "Defina DEMO_CLIENT_EMAIL com outro e-mail.",
  );
}
note(
  protagonist.existed
    ? `${protagonist.fullName} já existia (${protagonist.email}): reaproveitado, senha intacta`
    : `${protagonist.fullName} criado (${protagonist.email})`,
);

const others = [];
for (const [index, def] of OTHER_CLIENTS.entries()) {
  if (normalize(def.name) === normalize(CLIENT_NAME)) continue;
  const client = await ensureClient(def, 100 + index);
  others.push({ ...def, id: client.id, email: client.email });
}
note(`${others.length} colegas simulados prontos`);

// ================================================================ planos

step("Planos e atribuições");

const plans = {};
{
  const list = await admin.call("GET", "/plans");
  for (const def of PLANS) {
    let found = list.find((p) => normalize(p.name) === normalize(def.name));
    if (found) {
      kept("planos");
      if (!found.isActive) await admin.call("POST", `/plans/${found.id}/activate`);
    } else {
      found = await admin.call("POST", "/plans", {
        body: { name: def.name, description: def.description },
      });
      made("planos");
      note(`plano criado: ${def.name}`);
    }
    plans[def.name] = found;
  }
}

async function assignPlan(clientId, planName, startOffset, endOffset) {
  const assign = (name, from, to) =>
    admin.call("POST", "/plan-assignments", {
      body: {
        clientId,
        planId: plans[name].id,
        startDate: addDays(today, from),
        endDate: addDays(today, to),
      },
    });
  const history = await admin.call("GET", `/plan-assignments?clientId=${clientId}`);
  const active = history.find((a) => a.status === "ACTIVE");
  if (active && active.plan.name === planName) {
    kept("atribuições de plano");
    return false;
  }
  if (active) {
    // Um plano diferente já está ativo: só o do protagonista é trocado (o da demo precisa ser o Performance).
    if (clientId !== protagonist.id) {
      kept("atribuições de plano");
      return false;
    }
  } else if (history.length === 0 && clientId === protagonist.id) {
    // Histórico de planos: um Essencial anterior, já encerrado.
    await assign("Plano Essencial", -150, -61);
    made("atribuições de plano");
  }
  await assign(planName, startOffset, endOffset);
  made("atribuições de plano");
  return true;
}

if (await assignPlan(protagonist.id, "Plano Performance", -60, 30)) {
  note(
    `${protagonist.fullName}: Plano Performance (${brDate(addDays(today, -60))} a ${brDate(addDays(today, 30))})`,
  );
}
for (const other of others) {
  if (other.plan)
    await soft(`plano de ${other.name}`, () =>
      assignPlan(other.id, other.plan.name, other.plan.start, other.plan.end),
    );
}

// ================================================================ professor <-> clientes

step("Atribuições professor-cliente");
{
  const assignments = new Set(
    (await admin.call("GET", "/assignments")).map((a) => `${a.teacher.id}:${a.client.id}`),
  );
  const want = [
    [
      "camila",
      [
        protagonist,
        ...others.filter((o) => ["larissa", "marina", "thiago", "beatriz"].includes(o.key)),
      ],
    ],
    ["rafael", others.filter((o) => ["otavio", "fernando", "gustavo", "juliana"].includes(o.key))],
    ["aline", others.filter((o) => ["camilaD", "rodrigo"].includes(o.key))],
  ];
  for (const [teacher, clients] of want) {
    for (const client of clients) {
      if (assignments.has(`${staff[teacher].id}:${client.id}`)) {
        kept("atribuições professor-cliente");
        continue;
      }
      const ok = await soft(`atribuir ${client.fullName ?? client.name}`, () =>
        admin.call("POST", "/assignments", {
          body: { teacherId: staff[teacher].id, clientId: client.id },
        }),
      );
      if (ok) made("atribuições professor-cliente");
    }
  }
}

// ================================================================ agenda: agenda dos próximos dias

step(`Agenda dos próximos ${FUTURE_DAYS} dias`);

/** Horário das aulas temporárias do passo de histórico (criadas no futuro, antes de irem para o passado). */
const TEMP_SLOT = "05:00";

/** Grade carregada da API: todas as aulas de [hoje-45, hoje+200], para conferir conflitos de horário. */
let sched = [];
async function reloadSchedule() {
  sched = await admin.call(
    "GET",
    `/occurrences?from=${addDays(today, -45)}&to=${addDays(today, 200)}`,
  );
}
await reloadSchedule();

const startOf = (occ) => new Date(occ.startsAt).getTime();
const endOf = (occ) => new Date(occ.endsAt).getTime();
const findClash = (startMs, endMs, ignoreId) =>
  sched.find(
    (o) =>
      o.status === "SCHEDULED" && o.id !== ignoreId && startOf(o) < endMs && endOf(o) > startMs,
  );

/**
 * Cria a aula se ainda não existir uma igual (nome + horário). Devolve a aula
 * (nova ou existente) ou null se o horário está ocupado por outra aula.
 */
async function ensureClass({ date, time, template, teacher, capacity }) {
  const tpl = templates[template];
  const start = gymDateTimeToUtc(date, time).getTime();
  const end = start + tpl.durationMinutes * 60_000;
  const same = sched.find(
    (o) => o.status === "SCHEDULED" && o.name === tpl.name && startOf(o) === start,
  );
  if (same) {
    kept("aulas");
    return same;
  }
  const clash = findClash(start, end);
  if (clash) {
    warn(
      `${shortDay(date)} ${time} ${template}: horário ocupado por "${clash.name}" (${utcToGym(clash.startsAt).time}); aula pulada.`,
    );
    return null;
  }
  const occ = await admin.call("POST", "/occurrences", {
    body: {
      templateId: tpl.id,
      date,
      startTime: time,
      instructorId: staff[teacher].id,
      ...(capacity ? { capacity } : {}),
    },
  });
  sched.push(occ);
  made("aulas");
  return occ;
}

// Resíduos de uma execução interrompida (aulas temporárias do passo de histórico).
await cleanupLeftovers();

const future = []; // { occ, date, time, template }
for (let d = 0; d <= FUTURE_DAYS; d++) {
  const date = addDays(today, d);
  for (const entry of TIMETABLE[weekdayOf(date)] ?? []) {
    // Hoje: só o que ainda não começou e dá tempo de gravar (começa em 90 minutos ou mais).
    if (d === 0 && toMinutes(entry.time) < nowMinutes() + 90) continue;
    const occ = await ensureClass({ date, ...entry });
    if (occ) future.push({ occ, date, time: entry.time, template: entry.template });
  }
}
note(
  `${future.length} aulas na agenda de hoje a ${addDays(today, FUTURE_DAYS)} (${shortDay(today)} a ${shortDay(addDays(today, FUTURE_DAYS))})`,
);

// ---------------------------------------------------------------- reservas dos colegas (ocupação)

async function reservationsOf(occurrenceId) {
  return admin.call("GET", `/admin/reservations?occurrenceId=${occurrenceId}`);
}
const alive = (r) => r.status !== "CANCELLED";

async function reserve(clientId, occurrenceId, label) {
  try {
    const r = await admin.call("POST", "/admin/reservations", {
      body: { clientId, occurrenceId },
      headers: idempotency(),
    });
    return r;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "DUPLICATE_RESERVATION" || error.code === "CLASS_FULL")
    ) {
      return null;
    }
    if (error instanceof ApiError) {
      warn(`reserva ${label}: ${error.message}`);
      return null;
    }
    throw error;
  }
}

/** Garante `target` reservas vivas de colegas (nunca do protagonista) na aula. */
async function fillWith(occ, candidates, target) {
  if (occ.bookedCount >= target) return;
  const existing = (await reservationsOf(occ.id)).filter(alive);
  const taken = new Set(existing.map((r) => r.client.id));
  let count = existing.length;
  for (const candidate of candidates) {
    if (count >= target) break;
    if (taken.has(candidate.id) || candidate.id === protagonist.id) continue;
    if (await reserve(candidate.id, occ.id, `${candidate.name} em ${occ.name}`)) {
      count++;
      made("reservas de colegas");
    }
  }
  occ.bookedCount = count;
}

const rotate = (list, by) => list.map((_, i) => list[(i + by) % list.length]);

// Aula lotada e aula com uma vaga só: as duas mais próximas de cada modalidade, a partir de amanhã.
const tomorrow = addDays(today, 1);
const upcoming = future.filter((f) => f.date >= tomorrow);
const lastSpot =
  upcoming.find((f) => f.template === "Muay Thai iniciante") ??
  upcoming.find((f) => f.template === "Treino Funcional");
const fullClass =
  upcoming.find((f) => f.template === "Spinning 45min" && f !== lastSpot) ??
  upcoming.find((f) => f !== lastSpot);

async function setCapacity(f, capacity) {
  if (f.occ.capacity === capacity) return;
  const confirmed = f.occ.bookedCount;
  if (confirmed > capacity) {
    warn(
      `${f.template} ${shortDay(f.date)} ${f.time}: já tem ${confirmed} reservas, não dá para reduzir a capacidade para ${capacity}.`,
    );
    return;
  }
  const updated = await admin.call("PATCH", `/occurrences/${f.occ.id}`, { body: { capacity } });
  Object.assign(f.occ, updated);
}

if (lastSpot) {
  await setCapacity(lastSpot, 8);
  await fillWith(lastSpot.occ, rotate(others, 2), lastSpot.occ.capacity - 1);
}
if (fullClass) {
  await setCapacity(fullClass, 6);
  await fillWith(fullClass.occ, rotate(others, 5), fullClass.occ.capacity);
}

// Ocupação das demais aulas: de 25% a 85%, deterministica, sempre deixando 2 vagas para o protagonista.
for (const [index, f] of future.entries()) {
  if (f === lastSpot || f === fullClass) continue;
  const ratio = 0.25 + ((index * 37) % 61) / 100;
  const target = Math.min(Math.round(f.occ.capacity * ratio), others.length, f.occ.capacity - 2);
  if (target > 0) await fillWith(f.occ, rotate(others, index % others.length), target);
}
note(
  `${lastSpot ? `1 vaga restante: ${lastSpot.template} ${shortDay(lastSpot.date)} ${lastSpot.time}` : "sem aula de uma vaga"}; ` +
    `${fullClass ? `lotada: ${fullClass.template} ${shortDay(fullClass.date)} ${fullClass.time}` : "sem aula lotada"}`,
);

// ---------------------------------------------------------------- reservas do protagonista

step(`Reservas futuras de ${protagonist.fullName}`);

const protagonistBookings = [];
{
  const pick = [];
  // 1) Hoje, mais tarde (a próxima aula de hoje que ainda dá tempo de gravar).
  const laterToday = future.find((f) => f.date === today);
  if (laterToday) pick.push(laterToday);
  // 2 a 4) A próxima Treino Funcional, Yoga e Spinning, em dias diferentes, sem as duas aulas especiais.
  const usedDays = new Set(pick.map((f) => f.date));
  for (const template of ["Treino Funcional", "Yoga suave", "Spinning 45min", "Treino Funcional"]) {
    if (pick.length >= 4) break;
    const found = upcoming.find(
      (f) =>
        f.template === template &&
        f !== lastSpot &&
        f !== fullClass &&
        !usedDays.has(f.date) &&
        !pick.includes(f),
    );
    if (found) {
      pick.push(found);
      usedDays.add(found.date);
    }
  }
  if (!laterToday)
    warn(
      "Hoje não sobrou aula com tempo de gravar (muito tarde ou domingo): sem reserva para hoje.",
    );
  for (const f of pick) {
    const existing = (await reservationsOf(f.occ.id)).find(
      (r) => r.client.id === protagonist.id && alive(r),
    );
    if (existing) {
      kept("reservas do protagonista");
    } else {
      const r = await reserve(protagonist.id, f.occ.id, `${protagonist.fullName} em ${f.template}`);
      if (!r) continue;
      made("reservas do protagonista");
    }
    f.occ.bookedCount = Math.max(f.occ.bookedCount, 1);
    protagonistBookings.push(f);
    note(`reservada: ${f.template} ${shortDay(f.date)} ${f.time}`);
  }
}

// ================================================================ histórico (único ponto fora da API)

step("Histórico de presenças (passado)");

const require = createRequire(path.join(ROOT, "packages/api/package.json"));
let dbClient = null;
async function db() {
  if (dbClient) return dbClient;
  const { Client } = require("pg");
  dbClient = new Client({ connectionString: databaseUrl });
  await dbClient.connect();
  return dbClient;
}

/**
 * ÚNICA ESCRITA DIRETA NO BANCO: move a aula para o passado. A API não deixa
 * reservar aula que já começou nem mudar o horário de aula com reservas.
 */
async function shiftToPast(occ, date, time) {
  const startsAt = gymDateTimeToUtc(date, time);
  const endsAt = new Date(startsAt.getTime() + occ.durationMinutes * 60_000);
  const client = await db();
  const result = await client.query(
    'UPDATE class_occurrences SET "startsAt" = $2, "endsAt" = $3, "updatedAt" = now() WHERE id = $1',
    [occ.id, startsAt, endsAt],
  );
  if (result.rowCount !== 1) {
    fail(
      "O UPDATE no banco não encontrou a aula que a API acabou de criar: o DATABASE_URL do .env " +
        "não é o banco que a API está usando. Corrija o .env e rode de novo (é seguro).",
    );
  }
  occ.startsAt = startsAt.toISOString();
  occ.endsAt = endsAt.toISOString();
}

let tempCounter = 0;
function nextTempDate() {
  for (;;) {
    const date = addDays(today, 120 + tempCounter++);
    const start = gymDateTimeToUtc(date, TEMP_SLOT).getTime();
    if (!findClash(start, start + 60 * 60_000)) return date;
  }
}

/** Resíduo de execução interrompida: aula das 05:00, daqui a 120+ dias, de um professor da demo. */
async function cleanupLeftovers() {
  const teacherIds = new Set(Object.values(staff).map((s) => s.id));
  const templateNames = new Set(TEMPLATES.map((t) => t.name));
  const leftovers = sched.filter(
    (o) =>
      o.status === "SCHEDULED" &&
      o.startsAt >= gymDateTimeToUtc(addDays(today, 100), "00:00").toISOString() &&
      utcToGym(o.startsAt).time === TEMP_SLOT &&
      o.instructor &&
      teacherIds.has(o.instructor.id) &&
      templateNames.has(o.name),
  );
  let removed = 0;
  for (const occ of leftovers) {
    for (const r of (await reservationsOf(occ.id)).filter((x) => x.status === "CONFIRMED")) {
      await soft("limpar reserva temporária", () =>
        admin.call("POST", `/admin/reservations/${r.id}/cancel`),
      );
    }
    const ok = await soft("limpar aula temporária", async () => {
      await admin.call("DELETE", `/occurrences/${occ.id}`);
      return true;
    });
    if (ok) removed++;
  }
  if (removed > 0)
    note(`${removed} aula(s) temporária(s) de uma execução interrompida removida(s)`);
  if (leftovers.length > 0) await reloadSchedule();
}

/** Primeiro horário livre da lista (aula que já existe no horário conta como livre). */
function pickTime(date, times, template) {
  const tpl = templates[template];
  for (const time of times) {
    const start = gymDateTimeToUtc(date, time).getTime();
    const existing = sched.find(
      (o) => o.status === "SCHEDULED" && o.name === tpl.name && startOf(o) === start,
    );
    if (existing) return { time, existing };
    if (!findClash(start, start + tpl.durationMinutes * 60_000)) return { time };
  }
  return null;
}

// ---- lista de aulas passadas (cronológica)
const jobs = []; // { date, time, template, teacher, capacity, attendees: [{ client, plan }], kind }

// Aulas do protagonista (15 antes de hoje): todos os dias de funcionamento da última semana e,
// antes disso, só segundas, quartas e sextas.
const gDates = [];
for (let d = 1; d <= 60 && gDates.length < 15; d++) {
  const date = addDays(today, -d);
  const weekday = weekdayOf(date);
  if (weekday === 0) continue;
  if (d <= 7 || [1, 3, 5].includes(weekday)) gDates.push(date);
}

// Hoje, mais cedo: uma aula do começo do dia (conta para o ranking semanal/mensal mesmo na segunda-feira)
// e a aula "ao vivo", que começou há pouco e fica com a presença pendente para gravar.
const todayPlan = await planToday();
const gClasses = [
  ...(todayPlan.early ? [{ today: true, date: today, ...todayPlan.early }] : []),
  ...gDates.map((date) => ({ date })),
];

gClasses.forEach((slot, k) => {
  const date = slot.date;
  const def = slot.today
    ? { template: "Treino Funcional", teacher: "camila", capacity: 12, time: slot.time, alt: [] }
    : HISTORY_BY_WEEKDAY[weekdayOf(date)];
  const attendees = [{ client: protagonist, plan: slot.today ? "P" : protagonistMark(k) }];
  for (const other of others) {
    const ch = other.pattern[k];
    if (ch === "P" || ch === "A") attendees.push({ client: other, plan: ch });
  }
  jobs.push({ kind: "treino", date, ...def, times: [def.time, ...(def.alt ?? [])], attendees });
});

// Aula extra com o cancelamento do protagonista.
{
  let date = null;
  for (let d = 8; d <= 20 && !date; d++) {
    const candidate = addDays(today, -d);
    if ([2, 4].includes(weekdayOf(candidate))) date = candidate;
  }
  const attendees = [{ client: protagonist, plan: "X" }];
  for (const key of CANCELLED_CLASS.attendees) {
    const other = others.find((o) => o.key === key);
    if (other) attendees.push({ client: other, plan: "P" });
  }
  jobs.push({
    kind: "cancelada",
    date,
    ...CANCELLED_CLASS,
    times: [CANCELLED_CLASS.time, ...CANCELLED_CLASS.alt],
    attendees,
  });
}
jobs.sort((a, b) => (a.date + (a.times[0] ?? "")).localeCompare(b.date + (b.times[0] ?? "")));

/**
 * Hoje: a aula "ao vivo" (começou há pouco, presença pendente) e a do começo do
 * dia (já registrada). Depende da hora em que o script roda; numa segunda
 * execução no mesmo dia reaproveita as que já existem em vez de criar outras.
 */
async function planToday() {
  const result = { live: null, early: null, existingLive: null };
  const now = nowMinutes();
  const mine = await admin.call(
    "GET",
    `/admin/reservations?clientId=${protagonist.id}&from=${today}&to=${today}`,
  );
  const started = mine.filter(
    (r) => r.status !== "CANCELLED" && new Date(r.occurrence.startsAt).getTime() < Date.now(),
  );
  const pending = started.find((r) => r.status === "CONFIRMED");
  const registered = started
    .filter((r) => r.status === "COMPLETED" || r.status === "NO_SHOW")
    .sort((a, b) => a.occurrence.startsAt.localeCompare(b.occurrence.startsAt));
  if (pending) result.existingLive = pending.occurrence;
  // A primeira aula já registrada de hoje é a do começo do dia (a mesma da execução anterior).
  if (registered.length > 0)
    result.early = { time: utcToGym(registered[0].occurrence.startsAt).time };
  // Já existe uma ao vivo esperando a presença: nada a criar.
  if (pending) return result;

  // Não há (ou ela já foi usada na gravação): acha o último horário livre de hoje que já começou.
  const duration = templates["Treino Funcional"].durationMinutes;
  const free = [...TODAY_SLOTS]
    .reverse()
    .filter((time) => toMinutes(time) <= now - 10)
    .filter((time) => {
      const start = gymDateTimeToUtc(today, time).getTime();
      return !findClash(start, start + duration * 60_000);
    });
  if (free.length > 0) {
    result.live = { time: free[0] };
    if (!result.early) {
      const early = free.find((time) => toMinutes(time) + duration <= toMinutes(free[0]));
      if (early) result.early = { time: early };
    }
  }
  return result;
}

// ---- execução de cada aula
const teacherOf = async (key) => sessionOf(key);

async function markAttendance(session, reservationId, status) {
  await session.call("POST", `/attendance/reservations/${reservationId}`, { body: { status } });
}

/**
 * Aplica a presença planejada (P presente, A faltou, C presente corrigido para
 * falta) a uma reserva ainda PENDENTE. O que já foi registrado não é tocado:
 * é isso que torna a segunda execução inofensiva.
 */
async function applyMark(session, reservation, plan, label) {
  if (reservation.status !== "CONFIRMED") return false;
  const result = await soft(`presença (${label})`, async () => {
    if (plan === "C") {
      // Presente e depois corrigido para falta: o servidor estorna os pontos e recalcula streak e badges.
      await markAttendance(session, reservation.id, "PRESENT");
      await markAttendance(session, reservation.id, "ABSENT");
    } else {
      await markAttendance(session, reservation.id, plan === "P" ? "PRESENT" : "ABSENT");
    }
    return true;
  });
  return result === true;
}

let pastCreated = 0;
let pastReused = 0;
let marksApplied = 0;

for (const job of jobs) {
  const label = `${shortDay(job.date)} ${job.template}`;
  const picked = pickTime(job.date, job.times, job.template);
  if (!picked) {
    warn(`${label}: nenhum horário livre; aula do histórico pulada.`);
    continue;
  }
  const session = await teacherOf(job.teacher);
  let occ = picked.existing;

  if (occ) {
    pastReused++;
  } else {
    // Cria no futuro, reserva, cancela o que for "X" e move para o passado.
    const created = await admin.call("POST", "/occurrences", {
      body: {
        templateId: templates[job.template].id,
        date: nextTempDate(),
        startTime: TEMP_SLOT,
        instructorId: staff[job.teacher].id,
        capacity: Math.max(job.capacity, job.attendees.length + 1),
      },
    });
    sched.push(created);
    occ = created;
    const reserved = [];
    for (const attendee of job.attendees) {
      const r = await reserve(
        attendee.client.id,
        occ.id,
        `${attendee.client.fullName ?? attendee.client.name} em ${label}`,
      );
      if (!r) continue;
      reserved.push(r);
      if (attendee.plan === "X") await admin.call("POST", `/admin/reservations/${r.id}/cancel`);
    }
    try {
      await shiftToPast(occ, job.date, picked.time);
    } catch (error) {
      if (error?.code === "23P01") {
        // Exclusão de sobreposição: algo ocupou o horário entre a conferência e o UPDATE.
        warn(`${label}: horário ocupado na hora de mover para o passado; aula removida.`);
        for (const r of reserved.filter((x) => x.status !== "CANCELLED")) {
          await soft("cancelar", () => admin.call("POST", `/admin/reservations/${r.id}/cancel`));
        }
        await soft("remover", () => admin.call("DELETE", `/occurrences/${occ.id}`));
        sched = sched.filter((o) => o.id !== occ.id);
        continue;
      }
      throw error;
    }
    pastCreated++;
    made("aulas do histórico");
    made("reservas do histórico", reserved.length);
  }

  // Presença registrada pelo professor.
  const fresh = new Map((await reservationsOf(occ.id)).map((r) => [r.client.id, r]));
  for (const attendee of job.attendees) {
    if (attendee.plan === "X") continue;
    const reservation = fresh.get(attendee.client.id);
    if (!reservation || reservation.status === "CANCELLED") continue;
    if (
      await applyMark(
        session,
        reservation,
        attendee.plan,
        `${attendee.client.fullName ?? attendee.client.name}, ${label}`,
      )
    )
      marksApplied++;
  }
}
note(
  `${pastCreated} aulas passadas criadas, ${pastReused} já existiam; ${marksApplied} marcações de presença feitas`,
);

// ---------------------------------------------------------------- aula de hoje, ao vivo

step("Aula de hoje com presença pendente (para registrar ao vivo)");
let liveClass = null;
{
  if (todayPlan.existingLive) {
    kept("aulas ao vivo");
    const existing = todayPlan.existingLive;
    liveClass = { occ: existing, time: utcToGym(existing.startsAt).time };
    note(`já existe: ${existing.name} ${liveClass.time}, presença pendente`);
  } else if (!todayPlan.live) {
    warn(
      "Não achei horário livre de hoje já iniciado (muito cedo, antes das 06:10, ou tudo ocupado): " +
        "sem aula ao vivo. Rode de novo mais tarde.",
    );
  } else {
    const time = todayPlan.live.time;
    const created = await admin.call("POST", "/occurrences", {
      body: {
        templateId: templates["Treino Funcional"].id,
        date: nextTempDate(),
        startTime: TEMP_SLOT,
        instructorId: staff.camila.id,
        capacity: 12,
      },
    });
    sched.push(created);
    const bookings = [
      protagonist,
      ...others.filter((o) =>
        ["larissa", "marina", "thiago", "beatriz", "fernando"].includes(o.key),
      ),
    ];
    for (const c of bookings)
      await reserve(c.id, created.id, `${c.fullName ?? c.name} na aula ao vivo`);
    try {
      await shiftToPast(created, today, time);
      made("aulas ao vivo");
      liveClass = { occ: created, time };
      note(
        `criada: Treino Funcional ${time} com a Camila, ${bookings.length} reservas, presença PENDENTE (não registrada de propósito)`,
      );
    } catch (error) {
      if (error?.code === "23P01") warn("horário da aula ao vivo ocupado; aula não criada.");
      else throw error;
    }
  }
}

if (dbClient) await dbClient.end();
await reloadSchedule();

// ================================================================ metas e fichas

step("Metas e fichas de treino (professora Camila)");

const camila = await sessionOf("camila");

async function ensureGoal(client, def) {
  const goals = await camila.call("GET", `/goals?clientId=${client.id}`);
  let goal = goals.find((g) => normalize(g.title) === normalize(def.title));
  if (!goal) {
    goal = await camila.call("POST", "/goals", {
      body: {
        clientId: client.id,
        title: def.title,
        ...(def.description ? { description: def.description } : {}),
        ...(def.due !== undefined ? { dueDate: addDays(today, def.due) } : {}),
      },
    });
    made("metas");
  } else {
    kept("metas");
  }
  if (def.completed && goal.status === "ACTIVE") {
    await camila.call("POST", `/goals/${goal.id}/complete`);
    note(`meta concluída: ${client.fullName ?? client.name}: ${def.title}`);
  }
}

async function ensureSheet(client, def) {
  const sheets = await camila.call("GET", `/workout-sheets?clientId=${client.id}`);
  if (sheets.some((s) => normalize(s.title) === normalize(def.title))) {
    kept("fichas");
    return;
  }
  await camila.call("POST", "/workout-sheets", { body: { clientId: client.id, ...def } });
  made("fichas");
  note(`ficha criada: ${client.fullName ?? client.name}: ${def.title} (${def.status})`);
}

for (const def of PROTAGONIST_GOALS)
  await soft(`meta "${def.title}"`, () => ensureGoal(protagonist, def));
for (const def of PROTAGONIST_SHEETS)
  await soft(`ficha "${def.title}"`, () => ensureSheet(protagonist, def));
for (const [key, def] of Object.entries(OTHER_GOALS)) {
  const client = others.find((o) => o.key === key);
  if (client) await soft(`meta de ${client.name}`, () => ensureGoal(client, def));
}
for (const [key, def] of Object.entries(OTHER_SHEETS)) {
  const client = others.find((o) => o.key === key);
  if (client) await soft(`ficha de ${client.name}`, () => ensureSheet(client, def));
}

// ================================================================ resumo

step("Conferência");

const summary = await admin.call("GET", `/gamification/clients/${protagonist.id}`);
const rankingWeek = await soft("ranking semanal", () =>
  admin.call("GET", "/gamification/ranking?period=week"),
);
const rankingMonth = await soft("ranking mensal", () =>
  admin.call("GET", "/gamification/ranking?period=month"),
);
const dashMonth = await soft("dashboard", () => admin.call("GET", "/dashboard?period=month"));
const dashWeek = await soft("dashboard semanal", () => admin.call("GET", "/dashboard?period=week"));
const upcomingReservations = await admin.call(
  "GET",
  `/admin/reservations?clientId=${protagonist.id}&from=${today}&to=${addDays(today, 30)}`,
);
const pastReservations = await admin.call(
  "GET",
  `/admin/reservations?clientId=${protagonist.id}&from=${addDays(today, -60)}&to=${today}`,
);
const activeClients = (await admin.call("GET", "/clients?status=ACTIVE")).length;
const futureOccurrences = sched.filter(
  (o) =>
    o.status === "SCHEDULED" &&
    startOf(o) >= Date.now() &&
    utcToGym(o.startsAt).date <= addDays(today, FUTURE_DAYS),
);

// Login do protagonista (só para dizer qual senha usar; nunca altera nada).
let protagonistLogin;
try {
  await api.request("POST", "/auth/login", {
    body: { email: protagonist.email, password: PASSWORD },
  });
  protagonistLogin = "ok";
} catch {
  protagonistLogin = "falhou";
}

const publicName = (fullName) => {
  const words = fullName.trim().split(/\s+/);
  return words.length < 2 ? words[0] : `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
};
const standing = (ranking) => {
  if (!ranking) return "indisponível";
  const me = publicName(protagonist.fullName);
  const mine = ranking.entries.find((e) => e.name === me);
  const list = ranking.entries.map((e) => `${e.position}º ${e.name} ${e.points}`).join(" · ");
  return `${ranking.entries.length} no ranking${mine ? ` (${me}: ${mine.position}º com ${mine.points} pontos)` : ` (${me} fora do ranking)`}\n        ${list}`;
};

const counted = (status) =>
  pastReservations.filter(
    (r) => r.status === status && new Date(r.occurrence.startsAt).getTime() < Date.now(),
  ).length;
const earned = summary.badges.filter((b) => b.earned).map((b) => b.milestone);

log("");
log("=".repeat(78));
log(` RESUMO: massa de demonstração de ${protagonist.fullName}`);
log("=".repeat(78));
log("");
log(" LOGINS (todos os perfis usam a mesma origem de senha)");
log(`   Administrador : ${ADMIN_EMAIL}  (senha: INITIAL_ADMIN_PASSWORD do .env)`);
log(`   Professora    : ${staff.camila.email}  (senha: ${PASSWORD_SOURCE})`);
log(`   Professores   : ${staff.rafael.email}, ${staff.aline.email}`);
log(`   Recepção      : ${staff.bianca.email}`);
log(`   Cliente (vídeo): ${protagonist.email}`);
if (protagonist.existed) {
  log(
    protagonistLogin === "ok"
      ? `       senha: ${PASSWORD_SOURCE} (confirmado: o login com ela funciona).`
      : "       cliente já existia: use a senha que você definiu ao cadastrá-lo (o script não altera senhas existentes).",
  );
} else {
  log(`       senha: ${PASSWORD_SOURCE}`);
}
log("");
log(" CRIADO NESTA EXECUÇÃO / JÁ EXISTIA");
const kinds = [...new Set([...Object.keys(stats.created), ...Object.keys(stats.reused)])];
for (const kind of kinds) {
  log(
    `   ${kind.padEnd(32)} criados ${String(stats.created[kind] ?? 0).padStart(3)} · reaproveitados ${String(stats.reused[kind] ?? 0).padStart(3)}`,
  );
}
log("");
log(" O QUE EXISTE AGORA");
log(`   Clientes ativos                      : ${activeClients}`);
log(`   Aulas na agenda (hoje a +${FUTURE_DAYS} dias)      : ${futureOccurrences.length}`);
log(
  `   Reservas futuras do ${protagonist.fullName.split(" ")[0].padEnd(12)}     : ${upcomingReservations.filter((r) => r.status === "CONFIRMED" && new Date(r.occurrence.startsAt).getTime() > Date.now()).length} confirmadas`,
);
log(
  `   Histórico do ${protagonist.fullName.split(" ")[0].padEnd(12)}            : ${counted("COMPLETED")} presenças, ${counted("NO_SHOW")} falta(s), ${counted("CANCELLED")} cancelada(s), ${pastReservations.filter((r) => r.status === "CONFIRMED" && new Date(r.occurrence.startsAt).getTime() < Date.now()).length} pendente(s) (aula ao vivo)`,
);
log(
  `   Pontos / streak / badges             : ${summary.totalPoints} pontos · streak ${summary.streak.current}${summary.streak.next ? ` (próximo marco: ${summary.streak.next.threshold})` : ""} · badges ${earned.join(", ") || "nenhum"}`,
);
log(`   Ranking semanal                      : ${standing(rankingWeek)}`);
log(`   Ranking mensal                       : ${standing(rankingMonth)}`);
if (dashMonth?.gamification) {
  log(
    `   Dashboard (mês)                      : ${dashMonth.gamification.pointsDistributed} pontos distribuídos · ${dashMonth.gamification.attendances} presenças · ${dashMonth.gamification.clientsWithActiveStreak} streaks ativos`,
  );
}
if (dashWeek?.occupancy) {
  const week = dashWeek.occupancy.week;
  const booked = week.reduce((sum, o) => sum + o.booked, 0);
  const capacity = week.reduce((sum, o) => sum + o.capacity, 0);
  log(
    `   Ocupação da semana atual             : ${week.length} aulas, ${booked}/${capacity} vagas (${capacity ? Math.round((100 * booked) / capacity) : 0}%)`,
  );
}
if (lastSpot)
  log(
    `   Aula com UMA vaga                    : ${lastSpot.template} ${shortDay(lastSpot.date)} ${lastSpot.time}`,
  );
if (fullClass)
  log(
    `   Aula LOTADA                          : ${fullClass.template} ${shortDay(fullClass.date)} ${fullClass.time}`,
  );
if (liveClass)
  log(
    `   Aula de hoje para registrar ao vivo  : Treino Funcional ${liveClass.time} (Camila), presença pendente`,
  );
log("");
if (warnings.length > 0) {
  log(` AVISOS (${warnings.length})`);
  for (const w of warnings) log(`   - ${w}`);
  log("");
}

log(" ROTEIRO DE GRAVAÇÃO SUGERIDO (cada item: o que mostrar)");
const first = protagonist.fullName.split(/\s+/)[0];
const steps = [
  `Login como ${first} (${protagonist.email}) no navegador/janela 1.`,
  `Home: "Próximas aulas" (${protagonistBookings.length} reservas${protagonistBookings.some((f) => f.date === today) ? ", uma hoje mais tarde" : ""}), plano ativo e "Sua evolução" com ${summary.totalPoints} pontos e streak ${summary.streak.current}.`,
  `Agenda: aulas reservadas por ele${fullClass ? `, a aula lotada (${fullClass.template} ${shortDay(fullClass.date)} ${fullClass.time})` : ""}${lastSpot ? ` e a última vaga (${lastSpot.template} ${shortDay(lastSpot.date)} ${lastSpot.time}): reservar ao vivo` : ""}. Aba Histórico: presenças, falta e cancelada.`,
  `Gamificação ("Ver gamificação"): pontos, badges de streak ${earned.join(" e ")}, histórico recente e ranking semanal/mensal.`,
  "Plano (Performance, com histórico) e Ficha de treino (ativa com 4 exercícios + anterior concluída).",
  `Janela 2, professora Camila (${staff.camila.email}): Minhas aulas, aula de hoje${liveClass ? ` das ${liveClass.time}` : ""} com presença pendente: marcar ${first} como Presente (streak chega a ${summary.streak.current + 1}${summary.streak.next && summary.streak.current + 1 >= summary.streak.next.threshold ? `, desbloqueia o badge de ${summary.streak.next.threshold}` : ""}).`,
  `Volta para a janela do ${first}: Home/Gamificação já refletem os novos pontos (atualize a página).`,
  `Janela 3, administrador (${ADMIN_EMAIL}): Dashboard (ocupação por aula, clientes ativos, pontos distribuídos, presenças, ranking), Clientes → ${protagonist.fullName}.`,
];
steps.forEach((text, i) => log(`   ${i + 1}. ${text}`));
log("");
log(
  " Dica: use uma janela anônima ou um perfil de navegador por conta (o cookie de refresh é um só por navegador).",
);
log(
  " Rodar de novo é seguro (idempotente). Para recomeçar do zero: pnpm demo:reset e rode este script outra vez.",
);
log("");
