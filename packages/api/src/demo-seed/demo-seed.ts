import type { Module, PermissionAction, PermissionScope, PrismaClient } from "@prisma/client";
import { addDays, gymDateTimeToUtc, gymToday, weekdayOf } from "@fitburn/contracts";
import { hashPassword } from "../auth/password.util.js";
import { seedBaseData } from "../seed/base-seed.js";
import type { AttendanceService } from "../attendance/attendance.service.js";
import type { GoalsService } from "../goals/goals.service.js";
import {
  ACTIVE_GOALS,
  CLIENTS,
  COMPLETED_GOALS,
  DEMO_EMAIL_DOMAIN,
  PERSONAL_CLASS,
  PLANS,
  PRIME_SLOTS,
  PROFESSOR_PROFILE,
  MORNING_SLOTS,
  SATURDAY_SLOTS,
  SLOTS,
  STAFF,
  WORKOUT_TEMPLATES,
  fakeCpf,
} from "./demo-data.js";

/** Dias de agenda antes e depois de hoje. */
const PAST_DAYS = 35;
const FUTURE_DAYS = 21;
/** Aulas que começaram há menos que isto ficam com a presença pendente (para demonstrar o registro). */
const PENDING_WINDOW_MS = 3 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;

export interface DemoSeedDeps {
  prisma: PrismaClient;
  attendance: Pick<AttendanceService, "mark">;
  goals: Pick<GoalsService, "complete">;
  env?: NodeJS.ProcessEnv;
}

export interface DemoSeedSummary {
  adminEmail: string;
  staff: Array<{ fullName: string; email: string; role: string }>;
  clients: Array<{ fullName: string; email: string }>;
  occurrences: number;
  reservations: number;
  attendanceMarked: number;
}

/** PRNG determinístico (mulberry32): a mesma entrada gera sempre a mesma massa. */
function rngFrom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dateOnly = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

function emailOf(key: string): string {
  return `${key}@${DEMO_EMAIL_DOMAIN}`;
}

/**
 * Massa de demonstração para o ambiente remoto: equipe de professores,
 * clientes fictícios e uma agenda de Personal Class (várias simultâneas, de
 * professores diferentes) com histórico de presença, pontos, streak, metas,
 * planos e fichas de treino.
 *
 * Idempotente: tudo o que já existe (por e-mail, nome ou horário) é
 * reaproveitado, e a massa de cada dia é determinística. Rodar de novo em
 * outro dia completa a agenda. Presença, pontos, streak e metas passam pelos
 * serviços reais da API, então os números são os que o app calcularia.
 */
export async function seedDemoData(deps: DemoSeedDeps): Promise<DemoSeedSummary> {
  const { prisma, attendance, goals } = deps;
  const env = deps.env ?? process.env;

  const password = env.DEMO_USER_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `DEMO_USER_PASSWORD é obrigatória (mínimo ${MIN_PASSWORD_LENGTH} caracteres): é a senha das contas de demonstração.`,
    );
  }

  const { adminEmail } = await seedBaseData(prisma, env);
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const adminRequester = { userId: admin.id, scope: "ALL" } as const;
  const passwordHash = await hashPassword(password);

  // ---------------------------------------------------------------- perfis e equipe
  const professorProfile = await prisma.accessProfile.upsert({
    where: { name: PROFESSOR_PROFILE.name },
    update: {},
    create: { name: PROFESSOR_PROFILE.name, description: PROFESSOR_PROFILE.description },
  });
  for (const [module, actions, scope] of PROFESSOR_PROFILE.access) {
    await prisma.profileModuleAccess.upsert({
      where: { profileId_module: { profileId: professorProfile.id, module: module as Module } },
      update: {},
      create: {
        profileId: professorProfile.id,
        module: module as Module,
        actions: [...actions] as PermissionAction[],
        scope: scope as PermissionScope,
      },
    });
  }
  const adminProfile = await prisma.accessProfile.findUniqueOrThrow({
    where: { name: "Administrador" },
  });
  const clientProfile = await prisma.accessProfile.findUniqueOrThrow({
    where: { name: "Cliente" },
  });

  const teachers: Array<{ id: string; key: string }> = [];
  for (const person of STAFF) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: {
        email: person.email,
        passwordHash,
        fullName: person.fullName,
        profileId: person.role === "admin" ? adminProfile.id : professorProfile.id,
      },
    });
    if (person.role === "professor") teachers.push({ id: user.id, key: person.key });
  }
  if (teachers.length === 0)
    throw new Error("A equipe de demonstração precisa de ao menos um professor.");

  // ---------------------------------------------------------------- catálogo e planos
  const modality = await prisma.modality.upsert({
    where: { name: PERSONAL_CLASS.modality.name },
    update: {},
    create: { ...PERSONAL_CLASS.modality },
  });
  const existingTemplate = await prisma.classTemplate.findFirst({
    where: { name: PERSONAL_CLASS.template.name, modalityId: modality.id },
  });
  const template =
    existingTemplate ??
    (await prisma.classTemplate.create({
      data: { ...PERSONAL_CLASS.template, modalityId: modality.id },
    }));

  const plans = new Map<string, string>();
  for (const plan of PLANS) {
    const row = await prisma.plan.upsert({ where: { name: plan.name }, update: {}, create: plan });
    plans.set(plan.name, row.id);
  }

  // ---------------------------------------------------------------- clientes
  const today = gymToday();
  const clients: Array<{
    id: string;
    key: string;
    teacherId: string;
    spec: (typeof CLIENTS)[number];
  }> = [];
  for (const [index, spec] of CLIENTS.entries()) {
    const user = await prisma.user.upsert({
      where: { email: emailOf(spec.key) },
      update: {},
      create: {
        email: emailOf(spec.key),
        passwordHash,
        fullName: spec.fullName,
        phone: `(11) 9${String(8000 + index * 137).padStart(4, "0")}-${String(1000 + index * 211).slice(0, 4)}`,
        birthDate: dateOnly(
          `${1982 + (index % 18)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
        ),
        document: fakeCpf(index + 1),
        address: `Rua das Acácias, ${100 + index * 7} - São Paulo/SP`,
        profileId: clientProfile.id,
      },
    });
    const teacher = teachers[index % teachers.length];
    await prisma.teacherClientAssignment.upsert({
      where: { teacherId_clientId: { teacherId: teacher.id, clientId: user.id } },
      update: {},
      create: { teacherId: teacher.id, clientId: user.id },
    });
    clients.push({ id: user.id, key: spec.key, teacherId: teacher.id, spec });

    if ((await prisma.planAssignment.count({ where: { clientId: user.id } })) === 0) {
      // Metade começa por um plano mais antigo, já encerrado, para o histórico não ficar vazio.
      if (index % 2 === 0) {
        await prisma.planAssignment.create({
          data: {
            clientId: user.id,
            planId: plans.get("Plano Essencial")!,
            startDate: dateOnly(addDays(today, -150)),
            endDate: dateOnly(addDays(today, -61)),
            status: "ENDED",
          },
        });
      }
      await prisma.planAssignment.create({
        data: {
          clientId: user.id,
          planId: plans.get(spec.plan)!,
          startDate: dateOnly(addDays(today, -60)),
          endDate: dateOnly(addDays(today, 30)),
          status: "ACTIVE",
        },
      });
    }

    if ((await prisma.workoutSheet.count({ where: { clientId: user.id } })) === 0) {
      const [current, previous] = [
        WORKOUT_TEMPLATES[index % WORKOUT_TEMPLATES.length],
        WORKOUT_TEMPLATES[(index + 1) % WORKOUT_TEMPLATES.length],
      ];
      const sheet = (
        source: (typeof WORKOUT_TEMPLATES)[number],
        status: "ACTIVE" | "COMPLETED",
      ) => ({
        title: source.title,
        notes: source.notes,
        status,
        clientId: user.id,
        authorId: teacher.id,
        exercises: {
          create: source.exercises.map((exercise, position) => ({ position, ...exercise })),
        },
      });
      await prisma.workoutSheet.create({ data: sheet(current, "ACTIVE") });
      if (index % 3 === 0) await prisma.workoutSheet.create({ data: sheet(previous, "COMPLETED") });
    }
  }

  // ---------------------------------------------------------------- agenda (Personal Class)
  // Em cada horário vários professores atendem ao mesmo tempo; nos horários nobres, todos.
  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) {
    const date = addDays(today, offset);
    const weekday = weekdayOf(date);
    if (weekday === 0) continue;
    const slots = weekday === 6 ? SLOTS.filter((slot) => SATURDAY_SLOTS.has(slot)) : SLOTS;
    for (const slot of slots) {
      const startsAt = gymDateTimeToUtc(date, slot);
      const endsAt = new Date(
        startsAt.getTime() + PERSONAL_CLASS.template.durationMinutes * 60_000,
      );
      for (const teacher of teachers) {
        const works =
          PRIME_SLOTS.has(slot) || rngFrom(`slot|${date}|${slot}|${teacher.key}`)() < 0.55;
        if (!works) continue;
        const exists = await prisma.classOccurrence.findFirst({
          where: { instructorId: teacher.id, startsAt },
          select: { id: true },
        });
        if (exists) continue;
        await prisma.classOccurrence.create({
          data: {
            name: template.name,
            description: template.description,
            startsAt,
            endsAt,
            durationMinutes: template.durationMinutes,
            capacity: template.capacity,
            templateId: template.id,
            modalityId: modality.id,
            instructorId: teacher.id,
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------- reservas
  const rangeStart = gymDateTimeToUtc(addDays(today, -PAST_DAYS), "00:00");
  const rangeEnd = gymDateTimeToUtc(addDays(today, FUTURE_DAYS + 1), "00:00");
  const occurrences = await prisma.classOccurrence.findMany({
    where: {
      templateId: template.id,
      status: "SCHEDULED",
      startsAt: { gte: rangeStart, lt: rangeEnd },
    },
    include: { _count: { select: { reservations: { where: { status: { not: "CANCELLED" } } } } } },
    orderBy: { startsAt: "asc" },
  });
  const booked = new Map(occurrences.map((o) => [o.id, o._count.reservations]));
  const byDate = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const date = gymDateOf(occurrence.startsAt);
    byDate.set(date, [...(byDate.get(date) ?? []), occurrence]);
  }

  let reservationsCreated = 0;
  const now = new Date();
  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) {
    const date = addDays(today, offset);
    const dayClasses = byDate.get(date) ?? [];
    if (dayClasses.length === 0) continue;
    for (const client of clients) {
      const rng = rngFrom(`booking|${client.key}|${date}`);
      // O futuro é menos cheio que o passado: ainda há vagas para a demonstração ao vivo.
      const chance = client.spec.frequency * (offset > 0 ? 0.6 : 1);
      if (rng() >= chance) continue;
      const already = await prisma.reservation.findFirst({
        where: {
          clientId: client.id,
          occurrence: {
            startsAt: {
              gte: gymDateTimeToUtc(date, "00:00"),
              lt: gymDateTimeToUtc(addDays(date, 1), "00:00"),
            },
          },
        },
        select: { id: true },
      });
      if (already) continue;

      const preferred = dayClasses.filter((o) => {
        const slot = slotOf(o.startsAt);
        if (client.spec.period === "morning") return MORNING_SLOTS.has(slot);
        if (client.spec.period === "evening") return !MORNING_SLOTS.has(slot);
        return true;
      });
      const pool = (preferred.length > 0 ? preferred : dayClasses).filter(
        (o) => (booked.get(o.id) ?? 0) < o.capacity,
      );
      if (pool.length === 0) continue;
      // 70% das vezes o cliente treina com o professor dele, se houver vaga com ele.
      const withOwnTeacher = pool.filter((o) => o.instructorId === client.teacherId);
      const choices = withOwnTeacher.length > 0 && rng() < 0.7 ? withOwnTeacher : pool;
      const chosen = choices[Math.floor(rng() * choices.length)];

      const isPast = chosen.startsAt <= now;
      const cancelled = isPast && rng() < 0.04;
      await prisma.reservation.create({
        data: {
          clientId: client.id,
          occurrenceId: chosen.id,
          createdById: client.id,
          createdAt: new Date(
            chosen.startsAt.getTime() - (24 + Math.floor(rng() * 48)) * 3_600_000,
          ),
          ...(cancelled
            ? {
                status: "CANCELLED" as const,
                cancelledAt: new Date(chosen.startsAt.getTime() - 5 * 3_600_000),
                cancelledById: client.id,
              }
            : {}),
        },
      });
      if (!cancelled) booked.set(chosen.id, (booked.get(chosen.id) ?? 0) + 1);
      reservationsCreated++;
    }
  }

  // Aulas lotadas no futuro próximo (18h do primeiro professor nos próximos 3 dias úteis),
  // para demonstrar a vaga esgotada.
  let filledDays = 0;
  for (let offset = 1; offset <= 7 && filledDays < 3; offset++) {
    const date = addDays(today, offset);
    const target = (byDate.get(date) ?? []).find(
      (o) => o.instructorId === teachers[0].id && slotOf(o.startsAt) === "18:00",
    );
    if (!target) continue;
    filledDays++;
    const dayStart = gymDateTimeToUtc(date, "00:00");
    const dayEnd = gymDateTimeToUtc(addDays(date, 1), "00:00");
    for (const client of clients) {
      if ((booked.get(target.id) ?? 0) >= target.capacity) break;
      const busy = await prisma.reservation.findFirst({
        where: {
          clientId: client.id,
          status: { not: "CANCELLED" },
          occurrence: { startsAt: { gte: dayStart, lt: dayEnd } },
        },
        select: { id: true },
      });
      if (busy) continue;
      await prisma.reservation.create({
        data: { clientId: client.id, occurrenceId: target.id, createdById: client.id },
      });
      booked.set(target.id, (booked.get(target.id) ?? 0) + 1);
      reservationsCreated++;
    }
  }

  // ---------------------------------------------------------------- presença (pelo serviço real)
  // Em ordem cronológica, só do que ficou para trás há mais de PENDING_WINDOW_MS: as aulas
  // de agora ficam pendentes para a demonstração do registro de presença.
  const toMark = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      occurrence: {
        templateId: template.id,
        startsAt: { lt: new Date(now.getTime() - PENDING_WINDOW_MS) },
      },
    },
    select: {
      id: true,
      clientId: true,
      occurrence: { select: { startsAt: true, instructorId: true } },
    },
    orderBy: [{ occurrence: { startsAt: "asc" } }, { id: "asc" }],
  });
  let attendanceMarked = 0;
  for (const reservation of toMark) {
    const present = rngFrom(`attendance|${reservation.id}`)() < 0.9;
    await attendance.mark(reservation.id, present ? "PRESENT" : "ABSENT", adminRequester);
    attendanceMarked++;
  }

  // ---------------------------------------------------------------- metas
  for (const [index, client] of clients.entries()) {
    if ((await prisma.goal.count({ where: { clientId: client.id } })) > 0) continue;
    const active = ACTIVE_GOALS[index % ACTIVE_GOALS.length];
    await prisma.goal.create({
      data: {
        ...active,
        clientId: client.id,
        createdById: client.teacherId,
        dueDate: dateOnly(addDays(today, 14 + index * 3)),
      },
    });
    if (index % 2 === 0) {
      const done = COMPLETED_GOALS[index % COMPLETED_GOALS.length];
      const goal = await prisma.goal.create({
        data: { ...done, clientId: client.id, createdById: client.teacherId },
      });
      await goals.complete(goal.id, adminRequester);
    }
  }

  return {
    adminEmail,
    staff: STAFF.map((p) => ({ fullName: p.fullName, email: p.email, role: p.role })),
    clients: CLIENTS.map((c) => ({ fullName: c.fullName, email: emailOf(c.key) })),
    occurrences: occurrences.length,
    reservations: reservationsCreated,
    attendanceMarked,
  };
}

/** Dia local da academia (YYYY-MM-DD) de um instante. */
function gymDateOf(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Hora local da academia (HH:MM) de um instante. */
function slotOf(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}
