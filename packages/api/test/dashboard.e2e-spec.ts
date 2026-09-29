import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { addDays, gymDateTimeToUtc, gymToday, startOfWeek } from "@fitburn/contracts";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import {
  createAccessProfile,
  createOccurrence,
  createReservation,
  createUser,
  grantModuleAccess,
} from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Dashboard da equipe (HTTP)", () => {
  let app: INestApplication;
  let clientProfileId: string;
  let teacherProfileId: string;
  let adminToken: string;
  let teacherToken: string;

  const today = gymToday();
  const weekStart = startOfWeek(today);
  // Outro dia da mesma semana (domingo usa o dia anterior).
  const otherDay = today === addDays(weekStart, 6) ? addDays(today, -1) : addDays(today, 1);
  const at = (date: string, time: string) => gymDateTimeToUtc(date, time);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signIn(name: string, profileId: string, fullName = name) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName,
    });
    return { user, token: await loginAndGetAccessToken(app, user.email, PASSWORD) };
  }

  function dashboard(token: string, query = "") {
    return request(app.getHttpServer())
      .get(`/api/dashboard${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  const points = (clientId: string, type: "ATTENDANCE" | "GOAL", value: number, occurredAt: Date) =>
    testPrisma.pointsEntry.create({ data: { clientId, type, points: value, occurredAt } });

  let occurrences: { a: string; b: string; c: string };
  let ids: { ana: string; bruno: string; carla: string };

  // Cenário conhecido:
  //  - hoje: A 10h (Professor, 3 vagas; Ana e Bruno confirmados, Carla cancelou) e B 14h (sem professor, 2 vagas, lotada);
  //    D 18h está cancelada e não conta;
  //  - outro dia da semana: C 09h (Professor, 4 vagas, 1 reserva de Ana);
  //  - fora da semana: E, na semana seguinte, que não aparece;
  //  - passado: Ana compareceu a duas aulas seguidas (streak 2); Bruno compareceu e depois faltou (streak 0);
  //  - pontos no período: Ana 2 presenças (20), Bruno 1 presença + meta (35), Carla 1 presença (10);
  //    Dora (inativa) também conta no histórico do período (10 pontos, 1 presença), mas não é cliente ativa;
  //    um lançamento de 40 dias atrás fica de fora.
  beforeEach(async () => {
    await cleanDatabase();
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    teacherProfileId = (await createAccessProfile({ name: "Professor" })).id;
    for (const [module, scope] of [
      ["DASHBOARD", "ALL"],
      ["OCORRENCIAS", "ASSIGNED_CLASSES"],
      ["CLIENTES", "ASSIGNED_CLIENTS"],
      ["GAMIFICACAO", "ASSIGNED_CLIENTS"],
    ] as const) {
      await grantModuleAccess({
        profileId: teacherProfileId,
        module,
        actions: ["VIEW"],
        scope,
      });
    }

    adminToken = (await signIn("admin", adminProfile.id)).token;
    const teacher = await signIn("professor", teacherProfileId, "Rafael Lima");
    teacherToken = teacher.token;

    const ana = await signIn("ana", clientProfileId, "Ana Paula Souza");
    const bruno = await signIn("bruno", clientProfileId, "Bruno Alves");
    const carla = await signIn("carla", clientProfileId, "Carla Dias");
    ids = { ana: ana.user.id, bruno: bruno.user.id, carla: carla.user.id };
    const dora = await signIn("dora", clientProfileId, "Dora Melo");
    await testPrisma.user.update({ where: { id: dora.user.id }, data: { status: "INACTIVE" } });

    const a = await createOccurrence(at(today, "10:00"), {
      instructorId: teacher.user.id,
      name: "Aula A",
    });
    const b = await createOccurrence(at(today, "14:00"), { name: "Aula B" });
    await createOccurrence(at(today, "18:00"), { status: "CANCELLED", name: "Aula D" });
    const c = await createOccurrence(at(otherDay, "09:00"), {
      instructorId: teacher.user.id,
      name: "Aula C",
    });
    await createOccurrence(at(addDays(weekStart, 7), "10:00"), { name: "Aula E" });
    await testPrisma.classOccurrence.updateMany({ where: { id: a.id }, data: { capacity: 3 } });
    await testPrisma.classOccurrence.updateMany({ where: { id: b.id }, data: { capacity: 2 } });
    await testPrisma.classOccurrence.updateMany({ where: { id: c.id }, data: { capacity: 4 } });
    occurrences = { a: a.id, b: b.id, c: c.id };

    await createReservation(ana.user.id, a.id);
    await createReservation(bruno.user.id, a.id);
    await createReservation(carla.user.id, a.id, "CANCELLED");
    await createReservation(ana.user.id, b.id);
    await createReservation(bruno.user.id, b.id);
    await createReservation(ana.user.id, c.id);

    const past1 = await createOccurrence(at(addDays(today, -30), "10:00"), { name: "Passada 1" });
    const past2 = await createOccurrence(at(addDays(today, -29), "10:00"), { name: "Passada 2" });
    await createReservation(ana.user.id, past1.id, "COMPLETED");
    await createReservation(ana.user.id, past2.id, "COMPLETED");
    await createReservation(bruno.user.id, past1.id, "COMPLETED");
    await createReservation(bruno.user.id, past2.id, "NO_SHOW");

    const now = new Date();
    await points(ana.user.id, "ATTENDANCE", 10, now);
    await points(ana.user.id, "ATTENDANCE", 10, now);
    await points(bruno.user.id, "ATTENDANCE", 10, now);
    await points(bruno.user.id, "GOAL", 25, now);
    await points(carla.user.id, "ATTENDANCE", 10, now);
    await points(dora.user.id, "ATTENDANCE", 10, now);
    await points(ana.user.id, "ATTENDANCE", 10, at(addDays(today, -40), "10:00"));
  });

  it("mostra ocupação, vagas, clientes ativos e indicadores do período conforme o cenário conhecido", async () => {
    const response = await dashboard(adminToken, "?period=week");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      period: "week",
      from: weekStart,
      to: addDays(weekStart, 6),
      today,
    });

    const slot = (name: string, capacity: number, booked: number) =>
      expect.objectContaining({
        name,
        capacity,
        booked,
        availableSpots: capacity - booked,
      });
    expect(response.body.occupancy.today).toEqual([slot("Aula A", 3, 2), slot("Aula B", 2, 2)]);
    const week = response.body.occupancy.week.map((item: { name: string }) => item.name);
    expect([...week].sort()).toEqual(["Aula A", "Aula B", "Aula C"]);
    expect(response.body.occupancy.week).toEqual(expect.arrayContaining([slot("Aula C", 4, 1)]));
    // Em ordem cronológica.
    const starts = response.body.occupancy.week.map((item: { startsAt: string }) => item.startsAt);
    expect(starts).toEqual([...starts].sort());

    expect(response.body.activeClients).toEqual({ total: 3 });
    expect(response.body.gamification).toEqual({
      pointsDistributed: 75,
      attendances: 5,
      clientsWithActiveStreak: 1,
      top: [
        { position: 1, clientId: ids.bruno, fullName: "Bruno Alves", points: 35, attendances: 1, tied: false },
        { position: 2, clientId: ids.ana, fullName: "Ana Paula Souza", points: 20, attendances: 2, tied: false },
        { position: 3, clientId: ids.carla, fullName: "Carla Dias", points: 10, attendances: 1, tied: false },
      ],
    });
  });

  it("o período padrão é a semana e o mês traz a janela do mês atual", async () => {
    const week = await dashboard(adminToken);
    expect(week.body.period).toBe("week");

    const month = await dashboard(adminToken, "?period=month");
    expect(month.status).toBe(200);
    expect(month.body.period).toBe("month");
    expect(month.body.from).toBe(`${today.slice(0, 8)}01`);
    expect(month.body.gamification.pointsDistributed).toBe(75);
    // A ocupação é sempre a do dia e da semana.
    expect(month.body.occupancy.week).toHaveLength(3);
  });

  it("recusa um período inválido", async () => {
    const response = await dashboard(adminToken, "?period=ano");
    expect(response.status).toBe(400);
  });

  it("limita cada bloco ao escopo do perfil", async () => {
    const response = await dashboard(teacherToken, "?period=week");

    expect(response.status).toBe(200);
    // Só as aulas em que a pessoa é o professor.
    const names = response.body.occupancy.week.map((item: { name: string }) => item.name).sort();
    expect(names).toEqual(["Aula A", "Aula C"]);
    expect(response.body.occupancy.today.map((item: { id: string }) => item.id)).toEqual([
      occurrences.a,
    ]);
    // Só os clientes com reserva viva nas aulas dela: Carla cancelou.
    expect(response.body.activeClients).toEqual({ total: 2 });
    expect(response.body.gamification).toEqual({
      pointsDistributed: 55,
      attendances: 3,
      clientsWithActiveStreak: 1,
      top: [
        { position: 1, clientId: ids.bruno, fullName: "Bruno Alves", points: 35, attendances: 1, tied: false },
        { position: 2, clientId: ids.ana, fullName: "Ana Paula Souza", points: 20, attendances: 2, tied: false },
      ],
    });
  });

  it("omite os blocos dos módulos que o perfil não enxerga", async () => {
    await testPrisma.profileModuleAccess.deleteMany({
      where: { profileId: teacherProfileId, module: { in: ["OCORRENCIAS", "GAMIFICACAO"] } },
    });

    const response = await dashboard(teacherToken);

    expect(response.status).toBe(200);
    expect(response.body.occupancy).toBeNull();
    expect(response.body.gamification).toBeNull();
    expect(response.body.activeClients).toEqual({ total: 2 });
  });

  it("recusa quem não tem acesso ao módulo Dashboard e quem não está autenticado", async () => {
    await testPrisma.profileModuleAccess.deleteMany({
      where: { profileId: teacherProfileId, module: "DASHBOARD" },
    });
    expect((await dashboard(teacherToken)).status).toBe(403);

    const client = await signIn("marina", clientProfileId, "Marina Souza");
    expect((await dashboard(client.token)).status).toBe(403);

    expect((await request(app.getHttpServer()).get("/api/dashboard")).status).toBe(401);
  });
});
