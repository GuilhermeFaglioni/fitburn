import type { INestApplication } from "@nestjs/common";
import request from "supertest";
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
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("Gamificação: pontos (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let professorProfileId: string;
  let clientProfileId: string;

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
    professorProfileId = (await createAccessProfile({ name: "Professor" })).id;
    await grantModuleAccess({
      profileId: professorProfileId,
      module: "PRESENCA",
      actions: ["VIEW", "EXECUTE"],
      scope: "ASSIGNED_CLASSES",
    });
    await grantModuleAccess({
      profileId: professorProfileId,
      module: "GAMIFICACAO",
      actions: ["VIEW"],
      scope: "ASSIGNED_CLIENTS",
    });
  });

  async function signIn(name: string, profileId: string) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: name,
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { user, token };
  }

  const createProfessor = (name: string) => signIn(name, professorProfileId);
  const createAdmin = (name = "admin") => signIn(name, adminProfileId);
  const createClient = (name: string) => signIn(name, clientProfileId);

  const startedRecently = () => new Date(Date.now() - 30 * MINUTE);

  function mark(token: string, reservationId: string, status: "PRESENT" | "ABSENT") {
    return request(app.getHttpServer())
      .post(`/api/attendance/reservations/${reservationId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status });
  }

  function mine(token: string) {
    return request(app.getHttpServer())
      .get("/api/gamification/me")
      .set("Authorization", `Bearer ${token}`);
  }

  function ofClient(token: string, clientId: string) {
    return request(app.getHttpServer())
      .get(`/api/gamification/clients/${clientId}`)
      .set("Authorization", `Bearer ${token}`);
  }

  function addEntry(
    clientId: string,
    overrides: {
      points?: number;
      occurredAt?: Date;
      type?: "ATTENDANCE" | "GOAL" | "REVERSAL";
    } = {},
  ) {
    return testPrisma.pointsEntry.create({
      data: {
        clientId,
        type: overrides.type ?? "ATTENDANCE",
        points: overrides.points ?? 10,
        occurredAt: overrides.occurredAt ?? new Date(),
      },
    });
  }

  describe("Pontos por presença", () => {
    it("presente lança os pontos da configuração e o cliente vê o total e o histórico", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
        name: "Treino Funcional",
      });
      const reservation = await createReservation(marina.user.id, occurrence.id);

      const marked = await mark(rafael.token, reservation.id, "PRESENT");
      const summary = await mine(marina.token);

      expect(marked.status).toBe(200);
      expect(summary.status).toBe(200);
      expect(summary.body.totalPoints).toBe(10);
      expect(summary.body.history).toEqual([
        {
          id: expect.any(String),
          type: "ATTENDANCE",
          points: 10,
          occurredAt: occurrence.startsAt.toISOString(),
          subject: "Treino Funcional",
          milestone: null,
        },
      ]);
    });

    it("faltou não gera pontos", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await createReservation(marina.user.id, occurrence.id);

      await mark(rafael.token, reservation.id, "ABSENT");
      const summary = await mine(marina.token);

      expect(summary.body.totalPoints).toBe(0);
      expect(summary.body.history).toEqual([]);
    });

    it("cancelar a reserva não gera pontos", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * 60 * MINUTE), {
        instructorId: rafael.user.id,
      });
      const reservation = await createReservation(marina.user.id, occurrence.id);

      const cancelled = await request(app.getHttpServer())
        .post(`/api/reservations/${reservation.id}/cancel`)
        .set("Authorization", `Bearer ${marina.token}`);
      const summary = await mine(marina.token);

      expect(cancelled.status).toBe(200);
      expect(summary.body.totalPoints).toBe(0);
      expect(summary.body.history).toEqual([]);
      expect(await testPrisma.pointsEntry.count()).toBe(0);
    });

    it("a pontuação vem da configuração no banco, lida a cada registro", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const first = await createOccurrence(startedRecently(), { instructorId: rafael.user.id });
      const second = await createOccurrence(new Date(Date.now() - 3 * 60 * MINUTE), {
        instructorId: rafael.user.id,
      });
      const firstReservation = await createReservation(marina.user.id, first.id);
      const secondReservation = await createReservation(marina.user.id, second.id);

      await testPrisma.gamificationRule.update({
        where: { kind_threshold: { kind: "ATTENDANCE_POINTS", threshold: 0 } },
        data: { points: 15 },
      });
      await mark(rafael.token, firstReservation.id, "PRESENT");
      await testPrisma.gamificationRule.update({
        where: { kind_threshold: { kind: "ATTENDANCE_POINTS", threshold: 0 } },
        data: { points: 20 },
      });
      await mark(rafael.token, secondReservation.id, "PRESENT");
      const summary = await mine(marina.token);

      expect(summary.body.totalPoints).toBe(35);
      expect(summary.body.history.map((item: { points: number }) => item.points).sort()).toEqual([
        15, 20,
      ]);
    });

    it("sem a regra de presença configurada, o registro falha por inteiro", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await createReservation(marina.user.id, occurrence.id);
      await testPrisma.gamificationRule.deleteMany();

      const response = await mark(rafael.token, reservation.id, "PRESENT");

      expect(response.status).toBe(500);
      const after = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(after.status).toBe("CONFIRMED");
      expect(await testPrisma.pointsEntry.count()).toBe(0);
    });
  });

  describe("Minha gamificação", () => {
    it("soma todos os lançamentos e lista só os meus, do mais recente para o mais antigo", async () => {
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const oldest = await addEntry(marina.user.id, {
        points: 10,
        occurredAt: new Date(Date.now() - 3 * DAY),
      });
      const newest = await addEntry(marina.user.id, { points: 25, type: "GOAL" });
      const reversal = await addEntry(marina.user.id, {
        points: -10,
        type: "REVERSAL",
        occurredAt: new Date(Date.now() - DAY),
      });
      await addEntry(bruno.user.id, { points: 999 });

      const summary = await mine(marina.token);

      expect(summary.status).toBe(200);
      expect(summary.body.totalPoints).toBe(25);
      expect(summary.body.history.map((item: { id: string }) => item.id)).toEqual([
        newest.id,
        reversal.id,
        oldest.id,
      ]);
    });

    it("o histórico traz só os 20 mais recentes, mas o total soma tudo", async () => {
      const marina = await createClient("marina");
      await testPrisma.pointsEntry.createMany({
        data: Array.from({ length: 25 }, (_, index) => ({
          clientId: marina.user.id,
          type: "ATTENDANCE" as const,
          points: 10,
          occurredAt: new Date(Date.now() - index * DAY),
        })),
      });

      const summary = await mine(marina.token);

      expect(summary.body.totalPoints).toBe(250);
      expect(summary.body.history).toHaveLength(20);
    });

    it("quem ainda não tem pontos vê zero e histórico vazio; sem sessão é 401", async () => {
      const marina = await createClient("marina");

      const summary = await mine(marina.token);
      const anonymous = await request(app.getHttpServer()).get("/api/gamification/me");

      expect(summary.body.totalPoints).toBe(0);
      expect(summary.body.history).toEqual([]);
      expect(anonymous.status).toBe(401);
    });
  });

  describe("Gamificação de um cliente (equipe)", () => {
    it("o professor vê os clientes com reserva viva nas aulas dele, e só eles", async () => {
      const rafael = await createProfessor("rafael");
      const outro = await createProfessor("outro");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const camila = await createClient("camila");
      const mine_ = await createOccurrence(startedRecently(), { instructorId: rafael.user.id });
      const theirs = await createOccurrence(new Date(Date.now() - 5 * 60 * MINUTE), {
        instructorId: outro.user.id,
      });
      await createReservation(marina.user.id, mine_.id, "COMPLETED");
      await createReservation(bruno.user.id, theirs.id, "COMPLETED");
      await createReservation(camila.user.id, mine_.id, "CANCELLED");
      await addEntry(marina.user.id, { points: 10 });

      const own = await ofClient(rafael.token, marina.user.id);
      const other = await ofClient(rafael.token, bruno.user.id);
      const cancelledOnly = await ofClient(rafael.token, camila.user.id);

      expect(own.status).toBe(200);
      expect(own.body.totalPoints).toBe(10);
      expect(other.status).toBe(403);
      expect(other.body.code).toBe("OUT_OF_SCOPE");
      expect(cancelledOnly.status).toBe(403);
      expect(cancelledOnly.body.code).toBe("OUT_OF_SCOPE");
    });

    it("conta também a reserva confirmada de uma aula que ainda não começou", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const upcoming = await createOccurrence(new Date(Date.now() + 3 * 60 * MINUTE), {
        instructorId: rafael.user.id,
      });
      await createReservation(marina.user.id, upcoming.id, "CONFIRMED");

      const response = await ofClient(rafael.token, marina.user.id);

      expect(response.status).toBe(200);
    });

    it("perfil com escopo de aulas atribuídas enxerga os mesmos clientes; com escopo próprio, só a si mesmo", async () => {
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const classesProfile = await createAccessProfile({ name: "Por aulas" });
      await grantModuleAccess({
        profileId: classesProfile.id,
        module: "GAMIFICACAO",
        actions: ["VIEW"],
        scope: "ASSIGNED_CLASSES",
      });
      const ownProfile = await createAccessProfile({ name: "Só o próprio" });
      await grantModuleAccess({
        profileId: ownProfile.id,
        module: "GAMIFICACAO",
        actions: ["VIEW"],
        scope: "OWN",
      });
      const byClasses = await signIn("porAulas", classesProfile.id);
      const own = await signIn("proprio", ownProfile.id);
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: byClasses.user.id,
      });
      await createReservation(marina.user.id, occurrence.id, "COMPLETED");

      const inClass = await ofClient(byClasses.token, marina.user.id);
      const notInClass = await ofClient(byClasses.token, bruno.user.id);
      const otherClient = await ofClient(own.token, marina.user.id);

      expect(inClass.status).toBe(200);
      expect(notInClass.body.code).toBe("OUT_OF_SCOPE");
      expect(otherClient.body.code).toBe("OUT_OF_SCOPE");
    });

    it("o administrador vê qualquer cliente", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      await addEntry(marina.user.id, { points: 30 });

      const response = await ofClient(admin.token, marina.user.id);

      expect(response.status).toBe(200);
      expect(response.body.totalPoints).toBe(30);
    });

    it("recusa quem não tem permissão de gamificação, e responde 404 para quem não é cliente", async () => {
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const semGamificacaoProfile = await createAccessProfile({ name: "Recepção" });
      await grantModuleAccess({
        profileId: semGamificacaoProfile.id,
        module: "PRESENCA",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const recepcao = await signIn("recepcao", semGamificacaoProfile.id);
      const admin = await createAdmin();

      const asClient = await ofClient(marina.token, bruno.user.id);
      const withoutModule = await ofClient(recepcao.token, bruno.user.id);
      const unknown = await ofClient(admin.token, "nao-existe");
      const notAClient = await ofClient(admin.token, admin.user.id);

      expect(asClient.status).toBe(403);
      expect(asClient.body.code).toBe("FORBIDDEN");
      expect(withoutModule.status).toBe(403);
      expect(withoutModule.body.code).toBe("FORBIDDEN");
      expect(unknown.status).toBe(404);
      expect(notAClient.status).toBe(404);
    });
  });
});
