import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";
import { seedGamificationRules } from "../src/gamification/default-rules.js";
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
const DAY = 24 * 60 * 60_000;

describe("Exclusão com anonimização (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let clientProfileId: string;
  let teacherProfileId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await seedGamificationRules(testPrisma);
    adminProfileId = (await createAccessProfile({ name: "Administrador", isSystem: true })).id;
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    teacherProfileId = (await createAccessProfile({ name: "Professor" })).id;
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "CLIENTES",
      actions: ["VIEW", "EDIT"],
      scope: "ALL",
    });
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "USUARIOS",
      actions: ["VIEW", "EDIT"],
      scope: "ALL",
    });
  });

  function login(email: string) {
    return request(app.getHttpServer()).post("/api/auth/login").send({ email, password: PASSWORD });
  }

  async function signIn(name: string, profileId: string, document?: string) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: `${name} da Silva`,
      document,
    });
    await testPrisma.user.update({
      where: { id: user.id },
      data: { phone: "11999990000", birthDate: new Date("1990-01-02"), address: "Rua A, 1" },
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { user, token };
  }

  const createAdmin = () => signIn("admin", adminProfileId);
  const createClient = (name: string, document = `doc-${name}`) =>
    signIn(name, clientProfileId, document);
  const createTeacher = (name: string) => signIn(name, teacherProfileId);

  const deleteClient = (token: string, id: string) =>
    request(app.getHttpServer()).delete(`/api/clients/${id}`).set("Authorization", `Bearer ${token}`);
  const deleteUser = (token: string, id: string) =>
    request(app.getHttpServer()).delete(`/api/users/${id}`).set("Authorization", `Bearer ${token}`);
  const getJson = (token: string, path: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set("Authorization", `Bearer ${token}`);

  describe("Cliente", () => {
    it("anonimiza os dados pessoais, marca como excluído e mantém o histórico", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const plan = await testPrisma.plan.create({ data: { name: "Plano Mensal" } });
      await testPrisma.planAssignment.create({
        data: {
          planId: plan.id,
          clientId: ana.user.id,
          startDate: new Date(Date.now() - 5 * DAY),
          endDate: new Date(Date.now() + 25 * DAY),
          status: "ACTIVE",
        },
      });
      const occurrence = await createOccurrence(new Date(Date.now() - 3 * DAY));
      const reservation = await createReservation(ana.user.id, occurrence.id, "COMPLETED");
      await testPrisma.pointsEntry.create({
        data: {
          type: "ATTENDANCE",
          points: 10,
          occurredAt: new Date(Date.now() - 3 * DAY),
          clientId: ana.user.id,
          reservationId: reservation.id,
        },
      });

      const response = await deleteClient(admin.token, ana.user.id);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: ana.user.id,
        fullName: "Usuário excluído",
        phone: null,
        birthDate: null,
        document: null,
        address: null,
        status: "DELETED",
      });
      expect(response.body.email).toBe(`excluido-${ana.user.id}@anonimizado.invalid`);

      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
      expect(stored).toMatchObject({
        fullName: "Usuário excluído",
        phone: null,
        birthDate: null,
        document: null,
        address: null,
        status: "DELETED",
      });
      expect(await testPrisma.reservation.count({ where: { clientId: ana.user.id } })).toBe(1);
      expect(await testPrisma.pointsEntry.count({ where: { clientId: ana.user.id } })).toBe(1);
      expect(await testPrisma.planAssignment.count({ where: { clientId: ana.user.id } })).toBe(1);
    });

    it("corta o acesso: não entra mais, sessões revogadas e o token antigo deixa de valer", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const firstLogin = await login(ana.user.email);
      const refreshCookie = (firstLogin.headers["set-cookie"] as unknown as string[]).find((c) =>
        c.startsWith(`${REFRESH_COOKIE_NAME}=`),
      )!;

      await deleteClient(admin.token, ana.user.id);

      expect((await login(ana.user.email)).status).toBe(401);
      const placeholder = `excluido-${ana.user.id}@anonimizado.invalid`;
      expect((await login(placeholder)).status).toBe(401);
      const refresh = await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .set("Cookie", refreshCookie);
      expect(refresh.status).toBe(401);
      expect((await getJson(ana.token, "/me")).status).toBe(401);
      expect(
        await testPrisma.refreshToken.count({ where: { userId: ana.user.id, revokedAt: null } }),
      ).toBe(0);
    });

    it("libera e-mail e documento para um novo cadastro", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana", "111.222.333-44");
      await deleteClient(admin.token, ana.user.id);

      const created = await request(app.getHttpServer())
        .post("/api/clients")
        .set("Authorization", `Bearer ${admin.token}`)
        .send({
          fullName: "Ana Nova",
          email: ana.user.email,
          phone: "11999990000",
          birthDate: "1995-05-20",
          document: "111.222.333-44",
          address: "Rua das Flores, 10",
          password: PASSWORD,
        });

      expect(created.status).toBe(201);
      expect(created.body.email).toBe(ana.user.email);
    });

    it("excluir de novo devolve USER_ALREADY_DELETED e não mexe no registro", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      await deleteClient(admin.token, ana.user.id);
      const before = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });

      const again = await deleteClient(admin.token, ana.user.id);

      expect(again.status).toBe(409);
      expect(again.body.code).toBe("USER_ALREADY_DELETED");
      const after = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
      expect(after).toEqual(before);
    });

    it("duas exclusões simultâneas: uma anonimiza, a outra recebe USER_ALREADY_DELETED (nunca 500)", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");

      const responses = await Promise.all([
        deleteClient(admin.token, ana.user.id),
        deleteClient(admin.token, ana.user.id),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it("um excluído não é reativado nem editado", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      await deleteClient(admin.token, ana.user.id);

      const reactivate = await request(app.getHttpServer())
        .post(`/api/clients/${ana.user.id}/reactivate`)
        .set("Authorization", `Bearer ${admin.token}`);
      const edit = await request(app.getHttpServer())
        .patch(`/api/clients/${ana.user.id}`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ fullName: "Ressuscitada" });

      expect(reactivate.body.code).toBe("USER_ALREADY_DELETED");
      expect(edit.body.code).toBe("USER_ALREADY_DELETED");
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
      expect(stored.status).toBe("DELETED");
      expect(stored.fullName).toBe("Usuário excluído");
    });

    it("exige permissão de exclusão em Clientes; id inexistente ou de não cliente é 404", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const ana = await createClient("ana");

      const forbidden = await deleteClient(rafael.token, ana.user.id);
      const missing = await deleteClient(admin.token, "00000000-0000-0000-0000-000000000000");
      const staff = await deleteClient(admin.token, rafael.user.id);

      expect(forbidden.status).toBe(403);
      expect(missing.status).toBe(404);
      expect(staff.status).toBe(404);
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
      expect(stored.status).toBe("ACTIVE");
    });
  });

  describe("Equipe", () => {
    it("aplica a mesma anonimização a um membro da equipe, preservando o histórico dele", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const occurrence = await createOccurrence(new Date(Date.now() + 2 * DAY), {
        instructorId: rafael.user.id,
      });

      const response = await deleteUser(admin.token, rafael.user.id);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        fullName: "Usuário excluído",
        status: "DELETED",
        phone: null,
        document: null,
        address: null,
      });
      expect(response.body.email).toBe(`excluido-${rafael.user.id}@anonimizado.invalid`);
      expect((await login(rafael.user.email)).status).toBe(401);
      expect((await getJson(rafael.token, "/clients")).status).toBe(401);
      const stored = await testPrisma.classOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });
      expect(stored.instructorId).toBe(rafael.user.id);
      const again = await deleteUser(admin.token, rafael.user.id);
      expect(again.body.code).toBe("USER_ALREADY_DELETED");
    });

    it("exige permissão de exclusão em Usuários e recusa excluir a si mesmo", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const camila = await createTeacher("camila");

      expect((await deleteUser(rafael.token, camila.user.id)).status).toBe(403);
      const self = await deleteUser(admin.token, admin.user.id);
      expect(self.status).toBe(400);
      expect(
        (await testPrisma.user.findUniqueOrThrow({ where: { id: admin.user.id } })).status,
      ).toBe("ACTIVE");
      expect((await deleteUser(admin.token, "00000000-0000-0000-0000-000000000000")).status).toBe(
        404,
      );
    });
  });

  describe("Fora das listagens e do ranking, dentro dos agregados", () => {
    const points = (clientId: string, type: "ATTENDANCE" | "GOAL", value: number) =>
      testPrisma.pointsEntry.create({
        data: { clientId, type, points: value, occurredAt: new Date() },
      });

    it("some da lista de clientes (com ou sem filtro) e da lista de usuários", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      await createClient("bruno");
      const rafael = await createTeacher("rafael");
      await deleteClient(admin.token, ana.user.id);
      await deleteUser(admin.token, rafael.user.id);

      const all = await getJson(admin.token, "/clients");
      const active = await getJson(admin.token, "/clients?status=ACTIVE");
      const searched = await getJson(admin.token, "/clients?search=exclu");
      const users = await getJson(admin.token, "/users");

      expect(all.body.map((c: { fullName: string }) => c.fullName)).toEqual(["bruno da Silva"]);
      expect(active.body).toHaveLength(1);
      expect(searched.body).toEqual([]);
      expect(users.body.map((u: { fullName: string }) => u.fullName)).toEqual([
        "admin da Silva",
        "bruno da Silva",
      ]);
    });

    it("some do ranking, sem alterar a posição dos demais", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      await points(ana.user.id, "ATTENDANCE", 30);
      await points(bruno.user.id, "ATTENDANCE", 10);
      await deleteClient(admin.token, ana.user.id);

      const ranking = await getJson(bruno.token, "/gamification/ranking?period=month");

      expect(ranking.status).toBe(200);
      expect(ranking.body.entries).toHaveLength(1);
      expect(ranking.body.entries[0]).toMatchObject({ position: 1, isMe: true, points: 10 });
    });

    it("não aparece nas opções de atribuição de plano nem de professor", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const rafael = await createTeacher("rafael");
      await deleteClient(admin.token, ana.user.id);
      await deleteUser(admin.token, rafael.user.id);

      const planOptions = await getJson(admin.token, "/plans/options");
      const assignmentOptions = await getJson(admin.token, "/assignments/options");

      expect(planOptions.body.clients).toEqual([]);
      expect(assignmentOptions.body.clients).toEqual([]);
      expect(assignmentOptions.body.teachers.map((t: { id: string }) => t.id)).toEqual([
        admin.user.id,
      ]);
    });

    it("continua contando nos agregados históricos do dashboard, mas não como cliente ativo nem no topo", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      await points(ana.user.id, "ATTENDANCE", 10);
      await points(ana.user.id, "GOAL", 25);
      await points(bruno.user.id, "ATTENDANCE", 10);
      const before = await getJson(admin.token, "/dashboard?period=month");
      expect(before.body.gamification).toMatchObject({ pointsDistributed: 45, attendances: 2 });

      await deleteClient(admin.token, ana.user.id);
      const after = await getJson(admin.token, "/dashboard?period=month");

      expect(after.body.activeClients.total).toBe(before.body.activeClients.total - 1);
      expect(after.body.gamification.pointsDistributed).toBe(45);
      expect(after.body.gamification.attendances).toBe(2);
      expect(after.body.gamification.top.map((t: { fullName: string }) => t.fullName)).toEqual([
        "bruno da Silva",
      ]);
    });

    it("a reserva de quem foi excluído continua ocupando a vaga na ocupação da aula", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 60_000));
      await createReservation(ana.user.id, occurrence.id);
      await deleteClient(admin.token, ana.user.id);

      const dashboard = await getJson(admin.token, "/dashboard?period=week");

      const item = dashboard.body.occupancy.week.find((o: { id: string }) => o.id === occurrence.id);
      expect(item).toMatchObject({ booked: 1, capacity: 12, availableSpots: 11 });
    });

    it("um cliente excluído não conta como cliente com streak ativo", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() - 3 * DAY));
      await createReservation(ana.user.id, occurrence.id, "COMPLETED");
      const before = await getJson(admin.token, "/dashboard?period=month");
      expect(before.body.gamification.clientsWithActiveStreak).toBe(1);

      await deleteClient(admin.token, ana.user.id);
      const after = await getJson(admin.token, "/dashboard?period=month");

      expect(after.body.gamification.clientsWithActiveStreak).toBe(0);
    });
  });
});
