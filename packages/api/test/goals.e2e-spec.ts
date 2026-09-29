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

describe("Metas individuais (HTTP)", () => {
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
      module: "GAMIFICACAO",
      actions: ["VIEW", "CREATE", "EDIT"],
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
    return { user, token: await loginAndGetAccessToken(app, user.email, PASSWORD) };
  }

  const createAdmin = () => signIn("admin", adminProfileId);
  const createTeacher = (name: string) => signIn(name, teacherProfileId);
  const createClient = (name: string) => signIn(name, clientProfileId);

  /** Atribui o cliente ao professor (uma das duas origens do escopo). */
  async function assignTo(teacherId: string, clientId: string) {
    await testPrisma.teacherClientAssignment.create({ data: { teacherId, clientId } });
  }

  function api(token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    return {
      create: (body: unknown) =>
        request(app.getHttpServer())
          .post("/api/goals")
          .set(auth)
          .send(body as object),
      list: (clientId: string) =>
        request(app.getHttpServer()).get(`/api/goals?clientId=${clientId}`).set(auth),
      mine: () => request(app.getHttpServer()).get("/api/goals/mine").set(auth),
      clients: () => request(app.getHttpServer()).get("/api/goals/clients").set(auth),
      update: (id: string, body: unknown) =>
        request(app.getHttpServer())
          .patch(`/api/goals/${id}`)
          .set(auth)
          .send(body as object),
      complete: (id: string) =>
        request(app.getHttpServer()).post(`/api/goals/${id}/complete`).set(auth),
      cancel: (id: string) =>
        request(app.getHttpServer()).post(`/api/goals/${id}/cancel`).set(auth),
      gamification: () => request(app.getHttpServer()).get("/api/gamification/me").set(auth),
    };
  }

  async function setup() {
    const rafael = await createTeacher("rafael");
    const marina = await createClient("marina");
    await assignTo(rafael.user.id, marina.user.id);
    return { rafael, marina };
  }

  describe("CRUD", () => {
    it("o professor cria uma meta para um cliente do escopo, lista e edita enquanto ativa", async () => {
      const { rafael, marina } = await setup();

      const created = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Frequentar 12 aulas no mês",
        description: "Sem faltar",
        dueDate: "2026-10-30",
      });
      const edited = await api(rafael.token).update(created.body.id, {
        title: "Frequentar 10 aulas no mês",
        description: null,
        dueDate: null,
      });
      const listed = await api(rafael.token).list(marina.user.id);

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        clientId: marina.user.id,
        title: "Frequentar 12 aulas no mês",
        description: "Sem faltar",
        dueDate: "2026-10-30",
        status: "ACTIVE",
        concludedAt: null,
      });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({
        title: "Frequentar 10 aulas no mês",
        description: null,
        dueDate: null,
      });
      expect(listed.body.map((goal: { id: string }) => goal.id)).toEqual([created.body.id]);
    });

    it("cancelar mantém a meta na lista como cancelada, e ela não muda mais", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });

      const cancelled = await api(rafael.token).cancel(created.body.id);
      const edit = await api(rafael.token).update(created.body.id, { title: "Outra" });
      const complete = await api(rafael.token).complete(created.body.id);
      const cancelAgain = await api(rafael.token).cancel(created.body.id);

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe("CANCELLED");
      for (const response of [edit, complete, cancelAgain]) {
        expect(response.status).toBe(409);
        expect(response.body.code).toBe("GOAL_NOT_ACTIVE");
      }
      expect((await api(rafael.token).list(marina.user.id)).body).toHaveLength(1);
    });

    it("valida o título, o prazo e o cliente", async () => {
      const { rafael, marina } = await setup();

      const noTitle = await api(rafael.token).create({ clientId: marina.user.id, title: "  " });
      const badDate = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Meta",
        dueDate: "30/10/2026",
      });
      const impossibleDate = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Meta",
        dueDate: "2026-02-31",
      });
      const noClient = await api(rafael.token).create({ title: "Meta" });
      const unknownClient = await api(rafael.token).create({
        clientId: "nao-existe",
        title: "Meta",
      });
      const notAClient = await api(rafael.token).create({
        clientId: rafael.user.id,
        title: "Meta",
      });
      const missing = await api(rafael.token).update("nao-existe", { title: "x" });

      expect(noTitle.status).toBe(400);
      expect(badDate.status).toBe(400);
      expect(impossibleDate.status).toBe(400);
      expect(noClient.status).toBe(400);
      expect(unknownClient.status).toBe(404);
      expect(notAClient.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await testPrisma.goal.count()).toBe(0);
    });
  });

  describe("Concluir", () => {
    it("concluir lança os pontos da configuração, uma vez, e o cliente vê o ganho", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Frequentar 12 aulas no mês",
      });

      const completed = await api(rafael.token).complete(created.body.id);
      const gamification = await api(marina.token).gamification();

      expect(completed.status).toBe(200);
      expect(completed.body.status).toBe("COMPLETED");
      expect(completed.body.concludedAt).not.toBeNull();
      expect(gamification.body.totalPoints).toBe(25);
      expect(gamification.body.history[0]).toMatchObject({
        type: "GOAL",
        points: 25,
        subject: "Frequentar 12 aulas no mês",
      });
      const entry = await testPrisma.pointsEntry.findFirstOrThrow({ where: { type: "GOAL" } });
      expect(entry.goalId).toBe(created.body.id);
      expect(entry.occurredAt).toEqual(new Date(completed.body.concludedAt));
    });

    it("os pontos da meta contam no ranking da semana, sem contar como presença", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });
      await api(rafael.token).complete(created.body.id);

      const ranking = await request(app.getHttpServer())
        .get("/api/gamification/ranking?period=week")
        .set("Authorization", `Bearer ${marina.token}`);

      expect(ranking.body.entries).toMatchObject([
        { name: "marina", points: 25, attendances: 0, isMe: true },
      ]);
    });

    it("os pontos da meta vêm da configuração no banco", async () => {
      const { rafael, marina } = await setup();
      await testPrisma.gamificationRule.update({
        where: { kind_threshold: { kind: "GOAL_POINTS", threshold: 0 } },
        data: { points: 40 },
      });
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });

      await api(rafael.token).complete(created.body.id);

      expect((await api(marina.token).gamification()).body.totalPoints).toBe(40);
    });

    it("concluir de novo recusa com GOAL_ALREADY_CONCLUDED e não lança pontos outra vez; editar ou cancelar também", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });
      await api(rafael.token).complete(created.body.id);

      const again = await api(rafael.token).complete(created.body.id);
      const edit = await api(rafael.token).update(created.body.id, { title: "Outra" });
      const cancel = await api(rafael.token).cancel(created.body.id);

      for (const response of [again, edit, cancel]) {
        expect(response.status).toBe(409);
        expect(response.body.code).toBe("GOAL_ALREADY_CONCLUDED");
      }
      expect(await testPrisma.pointsEntry.count({ where: { type: "GOAL" } })).toBe(1);
    });

    it("duas conclusões simultâneas: uma vale e os pontos entram uma vez só", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });

      const [first, second] = await Promise.all([
        api(rafael.token).complete(created.body.id),
        api(rafael.token).complete(created.body.id),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect(await testPrisma.pointsEntry.count({ where: { type: "GOAL" } })).toBe(1);
    });

    it("sem a regra de pontos da meta configurada, a conclusão falha por inteiro", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });
      await testPrisma.gamificationRule.deleteMany({ where: { kind: "GOAL_POINTS" } });

      const response = await api(rafael.token).complete(created.body.id);

      expect(response.status).toBe(500);
      expect(
        (await testPrisma.goal.findUniqueOrThrow({ where: { id: created.body.id } })).status,
      ).toBe("ACTIVE");
    });
  });

  describe("Escopo e permissões", () => {
    it("o professor não cria, lista, edita, conclui nem cancela metas de cliente fora do escopo", async () => {
      const { rafael } = await setup();
      const stranger = await createClient("estranho");
      const other = await createTeacher("paula");
      await assignTo(other.user.id, stranger.user.id);
      const goal = await testPrisma.goal.create({
        data: { title: "Meta", clientId: stranger.user.id, createdById: other.user.id },
      });

      const responses = [
        await api(rafael.token).create({ clientId: stranger.user.id, title: "Meta" }),
        await api(rafael.token).list(stranger.user.id),
        await api(rafael.token).update(goal.id, { title: "x" }),
        await api(rafael.token).complete(goal.id),
        await api(rafael.token).cancel(goal.id),
      ];

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("OUT_OF_SCOPE");
      }
      expect((await testPrisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).status).toBe(
        "ACTIVE",
      );
    });

    it("os clientes com reserva nas aulas do professor também são do escopo", async () => {
      const rafael = await createTeacher("rafael");
      const inClass = await createClient("naaula");
      const occurrence = await createOccurrence(new Date(Date.now() + 60 * 60_000), {
        instructorId: rafael.user.id,
      });
      await createReservation(inClass.user.id, occurrence.id, "CONFIRMED");

      const response = await api(rafael.token).create({ clientId: inClass.user.id, title: "Meta" });

      expect(response.status).toBe(201);
    });

    it("o administrador gerencia metas de qualquer cliente", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");

      const created = await api(admin.token).create({ clientId: marina.user.id, title: "Meta" });
      const completed = await api(admin.token).complete(created.body.id);

      expect(created.status).toBe(201);
      expect(completed.status).toBe(200);
    });

    it("quem só visualiza não cria nem altera; o cliente não usa as rotas da equipe; sem sessão é 401", async () => {
      const { rafael, marina } = await setup();
      const viewerProfile = await createAccessProfile({ name: "Leitura" });
      await grantModuleAccess({
        profileId: viewerProfile.id,
        module: "GAMIFICACAO",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const viewer = await signIn("leitor", viewerProfile.id);
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Meta" });

      const create = await api(viewer.token).create({ clientId: marina.user.id, title: "Outra" });
      const complete = await api(viewer.token).complete(created.body.id);
      const list = await api(viewer.token).list(marina.user.id);
      const asClient = await api(marina.token).list(marina.user.id);
      const anonymous = await request(app.getHttpServer()).get("/api/goals/mine");

      expect(create.status).toBe(403);
      expect(complete.status).toBe(403);
      expect(list.status).toBe(200);
      expect(asClient.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });

    it("a lista de clientes do professor traz só os ativos do escopo (as duas origens)", async () => {
      const rafael = await createTeacher("rafael");
      const manual = await createClient("manual");
      const inClass = await createClient("naaula");
      const inactive = await createClient("inativo");
      const stranger = await createClient("estranho");
      await assignTo(rafael.user.id, manual.user.id);
      await assignTo(rafael.user.id, inactive.user.id);
      await testPrisma.user.update({
        where: { id: inactive.user.id },
        data: { status: "INACTIVE" },
      });
      const occurrence = await createOccurrence(new Date(Date.now() + 60 * 60_000), {
        instructorId: rafael.user.id,
      });
      await createReservation(inClass.user.id, occurrence.id, "CONFIRMED");

      const response = await api(rafael.token).clients();

      expect(response.status).toBe(200);
      expect(response.body.map((client: { id: string }) => client.id).sort()).toEqual(
        [manual.user.id, inClass.user.id].sort(),
      );
      expect(response.body.some((client: { id: string }) => client.id === stranger.user.id)).toBe(
        false,
      );
    });
  });

  describe("O cliente vê as próprias metas", () => {
    it("ativas e concluídas, só as dele; as canceladas não aparecem", async () => {
      const { rafael, marina } = await setup();
      const bruno = await createClient("bruno");
      await assignTo(rafael.user.id, bruno.user.id);
      const active = await api(rafael.token).create({ clientId: marina.user.id, title: "Ativa" });
      const done = await api(rafael.token).create({ clientId: marina.user.id, title: "Concluída" });
      const cancelled = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Cancelada",
      });
      await api(rafael.token).create({ clientId: bruno.user.id, title: "De outro" });
      await api(rafael.token).complete(done.body.id);
      await api(rafael.token).cancel(cancelled.body.id);

      const response = await api(marina.token).mine();

      expect(response.status).toBe(200);
      expect(
        response.body.map((goal: { title: string; status: string }) => [goal.title, goal.status]),
      ).toEqual([
        ["Ativa", "ACTIVE"],
        ["Concluída", "COMPLETED"],
      ]);
      expect(response.body[0].id).toBe(active.body.id);
    });
  });
});
