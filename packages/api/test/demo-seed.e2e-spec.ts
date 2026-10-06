import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AttendanceService } from "../src/attendance/attendance.service.js";
import { GoalsService } from "../src/goals/goals.service.js";
import { seedDemoData } from "../src/demo-seed/demo-seed.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "demo-senha-forte-123";
const ENV = {
  ...process.env,
  DEMO_USER_PASSWORD: PASSWORD,
  INITIAL_ADMIN_EMAIL: "admin@fitburn.example",
  INITIAL_ADMIN_PASSWORD: "uma-senha-forte-de-teste",
  INITIAL_ADMIN_NAME: "Administrador Fitburn",
};

describe("Seed da demonstração", () => {
  let app: INestApplication;
  let summary: Awaited<ReturnType<typeof seedDemoData>>;

  const run = () =>
    seedDemoData({
      prisma: testPrisma,
      attendance: app.get(AttendanceService),
      goals: app.get(GoalsService),
      env: ENV,
    });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase();
    summary = await run();
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it("recusa rodar sem a senha das contas de demonstração", async () => {
    await expect(
      seedDemoData({
        prisma: testPrisma,
        attendance: app.get(AttendanceService),
        goals: app.get(GoalsService),
        env: { ...ENV, DEMO_USER_PASSWORD: "curta" },
      }),
    ).rejects.toThrow("DEMO_USER_PASSWORD");
  });

  it("cria os professores e a Personal Class como única aula", async () => {
    const staff = await testPrisma.user.findMany({
      where: { profile: { name: "Professor" } },
      select: { fullName: true },
      orderBy: { fullName: "asc" },
    });
    expect(staff.map((u) => u.fullName)).toEqual([
      "Aline Rocha",
      "Camila Andrade",
      "Marcos Pereira",
      "Rafael Nogueira",
    ]);
    const names = await testPrisma.classOccurrence.groupBy({ by: ["name"] });
    expect(names.map((n) => n.name)).toEqual(["Personal Class"]);
    expect(await testPrisma.modality.count()).toBe(1);
  });

  it("tem Personal Class simultâneas de professores diferentes, nunca duas do mesmo professor", async () => {
    const rows = await testPrisma.classOccurrence.findMany({
      select: { startsAt: true, instructorId: true },
    });
    const perInstant = new Map<number, Set<string | null>>();
    for (const row of rows) {
      const key = row.startsAt.getTime();
      const set = perInstant.get(key) ?? new Set();
      expect(set.has(row.instructorId)).toBe(false);
      set.add(row.instructorId);
      perInstant.set(key, set);
    }
    expect(Math.max(...[...perInstant.values()].map((set) => set.size))).toBeGreaterThanOrEqual(2);
  });

  it("cria Wilson, Lara, Guilherme e Danielle como clientes", async () => {
    const clients = await testPrisma.user.findMany({
      where: { profile: { name: "Cliente" }, fullName: { endsWith: "Faglioni" } },
      select: { fullName: true },
    });
    expect(clients.length).toBe(3);
    expect(
      await testPrisma.user.count({
        where: { fullName: "Wilson Faglioni Junior", profile: { name: "Cliente" } },
      }),
    ).toBe(1);
  });

  it("gera histórico de presença, pontos, streak, metas, planos e fichas", async () => {
    expect(summary.attendanceMarked).toBeGreaterThan(0);
    expect(await testPrisma.reservation.count({ where: { status: "COMPLETED" } })).toBeGreaterThan(
      0,
    );
    expect(await testPrisma.pointsEntry.count()).toBeGreaterThan(0);
    expect(await testPrisma.streakBadge.count({ where: { revokedAt: null } })).toBeGreaterThan(0);
    expect(await testPrisma.goal.count({ where: { status: "COMPLETED" } })).toBeGreaterThan(0);
    expect(await testPrisma.planAssignment.count({ where: { status: "ACTIVE" } })).toBe(14);
    expect(await testPrisma.workoutSheet.count({ where: { status: "ACTIVE" } })).toBe(14);
  });

  it("nunca passa da capacidade e deixa ao menos uma aula futura lotada", async () => {
    const future = await testPrisma.classOccurrence.findMany({
      include: {
        _count: { select: { reservations: { where: { status: { not: "CANCELLED" } } } } },
      },
    });
    expect(future.every((o) => o._count.reservations <= o.capacity)).toBe(true);
    expect(
      future.some((o) => o.startsAt > new Date() && o._count.reservations === o.capacity),
    ).toBe(true);
  });

  it("as contas entram com a senha de demonstração", async () => {
    for (const email of ["lara@fitburn.example", "camila.andrade@fitburn.example"]) {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(201);
    }
  });

  it("é idempotente: rodar de novo não cria nada", async () => {
    const before = {
      users: await testPrisma.user.count(),
      occurrences: await testPrisma.classOccurrence.count(),
      reservations: await testPrisma.reservation.count(),
      points: await testPrisma.pointsEntry.count(),
      goals: await testPrisma.goal.count(),
      sheets: await testPrisma.workoutSheet.count(),
    };
    const again = await run();
    expect(again.reservations).toBe(0);
    expect(again.attendanceMarked).toBe(0);
    expect({
      users: await testPrisma.user.count(),
      occurrences: await testPrisma.classOccurrence.count(),
      reservations: await testPrisma.reservation.count(),
      points: await testPrisma.pointsEntry.count(),
      goals: await testPrisma.goal.count(),
      sheets: await testPrisma.workoutSheet.count(),
    }).toEqual(before);
  }, 60_000);
});
