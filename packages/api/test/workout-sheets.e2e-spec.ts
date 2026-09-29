import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Fichas de treino (HTTP)", () => {
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
    adminProfileId = (await createAccessProfile({ name: "Administrador", isSystem: true })).id;
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    teacherProfileId = (await createAccessProfile({ name: "Professor" })).id;
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "FICHAS_DE_TREINO",
      actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
      scope: "ASSIGNED_CLIENTS",
    });
    await grantModuleAccess({
      profileId: adminProfileId,
      module: "FICHAS_DE_TREINO",
      actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
      scope: "ALL",
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

  async function assignTo(teacherId: string, clientId: string) {
    await testPrisma.teacherClientAssignment.create({ data: { teacherId, clientId } });
  }

  function api(token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    return {
      create: (body: unknown) =>
        request(app.getHttpServer())
          .post("/api/workout-sheets")
          .set(auth)
          .send(body as object),
      list: (clientId: string) =>
        request(app.getHttpServer()).get(`/api/workout-sheets?clientId=${clientId}`).set(auth),
      clients: () => request(app.getHttpServer()).get("/api/workout-sheets/clients").set(auth),
      update: (id: string, body: unknown) =>
        request(app.getHttpServer())
          .patch(`/api/workout-sheets/${id}`)
          .set(auth)
          .send(body as object),
      remove: (id: string) =>
        request(app.getHttpServer()).delete(`/api/workout-sheets/${id}`).set(auth),
      mine: () => request(app.getHttpServer()).get("/api/workout-sheets/mine").set(auth),
      mineOne: (id: string) =>
        request(app.getHttpServer()).get(`/api/workout-sheets/mine/${id}`).set(auth),
    };
  }

  async function setup() {
    const rafael = await createTeacher("rafael");
    const marina = await createClient("marina");
    await assignTo(rafael.user.id, marina.user.id);
    return { rafael, marina };
  }

  const names = (exercises: Array<{ name: string }>) => exercises.map((item) => item.name);

  describe("edições simultâneas da mesma ficha", () => {
    it("serializa as gravações: todas dão certo e a lista final é a de uma delas, com posições únicas", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const created = await api(admin.token).create({
        clientId: marina.user.id,
        title: "Ficha A",
        exercises: [{ name: "Inicial 1" }, { name: "Inicial 2" }],
      });
      expect(created.status).toBe(201);
      const attempts = Array.from({ length: 8 }, (_, index) =>
        Array.from({ length: 3 }, (_, item) => ({ name: `T${index} exercício ${item}` })),
      );

      const responses = await Promise.all(
        attempts.map((exercises) => api(admin.token).update(created.body.id, { exercises })),
      );

      expect(responses.map((response) => response.status)).toEqual(attempts.map(() => 200));
      const rows = await testPrisma.workoutExercise.findMany({
        where: { sheetId: created.body.id },
        orderBy: { position: "asc" },
      });
      expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
      const names = rows.map((row) => row.name);
      expect(attempts.map((exercises) => exercises.map((item) => item.name))).toContainEqual(names);
    });
  });

  describe("CRUD", () => {
    it("o professor cria uma ficha para um cliente do escopo, com os exercícios na ordem enviada", async () => {
      const { rafael, marina } = await setup();

      const created = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
        notes: "Aquecer 10 minutos antes.",
        exercises: [
          {
            name: "Agachamento livre",
            sets: "4",
            reps: "10",
            load: "40kg",
            notes: "Descer até 90°.",
          },
          { name: "Prancha", sets: "3", duration: "45s" },
          { name: "Corrida leve", distance: "2km" },
        ],
      });
      const listed = await api(rafael.token).list(marina.user.id);

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        clientId: marina.user.id,
        title: "Fase 2",
        notes: "Aquecer 10 minutos antes.",
        status: "ACTIVE",
        authorName: "rafael",
      });
      expect(created.body.exercises).toMatchObject([
        {
          name: "Agachamento livre",
          sets: "4",
          reps: "10",
          load: "40kg",
          duration: null,
          distance: null,
          notes: "Descer até 90°.",
        },
        { name: "Prancha", sets: "3", reps: null, load: null, duration: "45s", notes: null },
        { name: "Corrida leve", sets: null, distance: "2km" },
      ]);
      expect(listed.status).toBe(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0].id).toBe(created.body.id);
      expect(names(listed.body[0].exercises)).toEqual([
        "Agachamento livre",
        "Prancha",
        "Corrida leve",
      ]);
    });

    it("recusa uma ficha sem título ou com exercício sem nome", async () => {
      const { rafael, marina } = await setup();

      const noTitle = await api(rafael.token).create({ clientId: marina.user.id, title: "  " });
      const noName = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 1",
        exercises: [{ name: "" }],
      });

      expect(noTitle.status).toBe(400);
      expect(noTitle.body.code).toBe("VALIDATION_ERROR");
      expect(noName.status).toBe(400);
      expect(noName.body.code).toBe("VALIDATION_ERROR");
    });

    it("o cliente pode ter várias fichas, inclusive várias ativas, e as ativas vêm primeiro", async () => {
      const { rafael, marina } = await setup();
      const api_ = api(rafael.token);
      const archived = await api_.create({
        clientId: marina.user.id,
        title: "Avaliação inicial",
        status: "ARCHIVED",
      });
      const completed = await api_.create({
        clientId: marina.user.id,
        title: "Fase 1",
        status: "COMPLETED",
      });
      const activeA = await api_.create({ clientId: marina.user.id, title: "Fase 2" });
      const activeB = await api_.create({ clientId: marina.user.id, title: "Mobilidade" });

      const listed = await api_.list(marina.user.id);

      expect(listed.body.map((sheet: { id: string }) => sheet.id)).toEqual([
        activeB.body.id,
        activeA.body.id,
        completed.body.id,
        archived.body.id,
      ]);
      expect(listed.body.map((sheet: { status: string }) => sheet.status)).toEqual([
        "ACTIVE",
        "ACTIVE",
        "COMPLETED",
        "ARCHIVED",
      ]);
    });

    it("editar troca título, observações e a lista de exercícios, reordenando, adicionando e removendo", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
        notes: "Antiga",
        exercises: [{ name: "A" }, { name: "B" }, { name: "C" }],
      });

      const edited = await api(rafael.token).update(created.body.id, {
        title: "Fase 2 (revisada)",
        notes: null,
        exercises: [{ name: "C", reps: "12" }, { name: "A" }, { name: "D", load: "10kg" }],
      });
      const listed = await api(rafael.token).list(marina.user.id);

      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ title: "Fase 2 (revisada)", notes: null });
      expect(names(edited.body.exercises)).toEqual(["C", "A", "D"]);
      expect(edited.body.exercises[0]).toMatchObject({ name: "C", reps: "12" });
      expect(names(listed.body[0].exercises)).toEqual(["C", "A", "D"]);
    });

    it("editar sem enviar os exercícios mantém a lista como está", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
        exercises: [{ name: "A" }, { name: "B" }],
      });

      const edited = await api(rafael.token).update(created.body.id, { title: "Novo título" });

      expect(edited.status).toBe(200);
      expect(edited.body.title).toBe("Novo título");
      expect(names(edited.body.exercises)).toEqual(["A", "B"]);
    });

    it("muda o status da ficha entre ativa, concluída e arquivada, e ela pode voltar a ficar ativa", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({ clientId: marina.user.id, title: "Fase 2" });

      const completed = await api(rafael.token).update(created.body.id, { status: "COMPLETED" });
      const archived = await api(rafael.token).update(created.body.id, { status: "ARCHIVED" });
      const reactivated = await api(rafael.token).update(created.body.id, { status: "ACTIVE" });
      const invalid = await api(rafael.token).update(created.body.id, { status: "OUTRO" });

      expect(completed.body.status).toBe("COMPLETED");
      expect(archived.body.status).toBe("ARCHIVED");
      expect(reactivated.body.status).toBe("ACTIVE");
      expect(invalid.status).toBe(400);
    });

    it("editar uma ficha que não existe responde 404", async () => {
      const { rafael } = await setup();

      const response = await api(rafael.token).update("nao-existe", { title: "x" });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    });

    it("excluir remove a ficha e os exercícios dela", async () => {
      const { rafael, marina } = await setup();
      const created = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
        exercises: [{ name: "A" }],
      });

      const removed = await api(rafael.token).remove(created.body.id);
      const listed = await api(rafael.token).list(marina.user.id);

      expect(removed.status).toBe(204);
      expect(listed.body).toEqual([]);
      expect(await testPrisma.workoutExercise.count()).toBe(0);
    });
  });

  describe("escopo da equipe", () => {
    it("o professor não cria nem vê fichas de clientes fora do escopo", async () => {
      const { rafael } = await setup();
      const camila = await createClient("camila");
      const outsideSheet = await api((await createAdmin()).token).create({
        clientId: camila.user.id,
        title: "Ficha da Camila",
      });

      const create = await api(rafael.token).create({ clientId: camila.user.id, title: "Invasão" });
      const list = await api(rafael.token).list(camila.user.id);
      const update = await api(rafael.token).update(outsideSheet.body.id, { title: "Invasão" });
      const remove = await api(rafael.token).remove(outsideSheet.body.id);

      for (const response of [create, list, update, remove]) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("OUT_OF_SCOPE");
      }
      expect(await testPrisma.workoutSheet.count()).toBe(1);
    });

    it("a lista de alunos do professor traz só os clientes ativos do escopo", async () => {
      const { rafael, marina } = await setup();
      await createClient("camila");

      const clients = await api(rafael.token).clients();

      expect(clients.status).toBe(200);
      expect(clients.body).toEqual([
        { id: marina.user.id, fullName: "marina", email: "marina@fitburn.local" },
      ]);
    });

    it("o administrador com escopo total gerencia as fichas de qualquer cliente", async () => {
      const admin = await createAdmin();
      const camila = await createClient("camila");

      const created = await api(admin.token).create({
        clientId: camila.user.id,
        title: "Fase 1",
        exercises: [{ name: "Remada" }],
      });
      const edited = await api(admin.token).update(created.body.id, { status: "COMPLETED" });
      const listed = await api(admin.token).list(camila.user.id);

      expect(created.status).toBe(201);
      expect(edited.body.status).toBe("COMPLETED");
      expect(listed.body).toHaveLength(1);
    });

    it("não cria ficha para quem não é cliente", async () => {
      const { rafael } = await setup();

      const response = await api(rafael.token).create({
        clientId: rafael.user.id,
        title: "Para mim mesmo",
      });

      expect(response.status).toBe(404);
      expect(await testPrisma.workoutSheet.count()).toBe(0);
    });

    it("sem permissão no módulo, a equipe recebe 403", async () => {
      const { marina } = await setup();
      const recepcao = await signIn(
        "recepcao",
        (await createAccessProfile({ name: "Recepção" })).id,
      );

      const list = await api(recepcao.token).list(marina.user.id);
      const create = await api(recepcao.token).create({ clientId: marina.user.id, title: "x" });

      expect(list.status).toBe(403);
      expect(create.status).toBe(403);
    });
  });

  describe("visão do cliente", () => {
    it("o cliente lê só as próprias fichas, com os exercícios, ativas primeiro", async () => {
      const { rafael, marina } = await setup();
      const camila = await createClient("camila");
      await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 1",
        status: "COMPLETED",
        exercises: [{ name: "Remada" }],
      });
      const active = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
        exercises: [{ name: "Agachamento" }, { name: "Supino" }],
      });
      await api((await createAdmin()).token).create({
        clientId: camila.user.id,
        title: "Da Camila",
      });

      const mine = await api(marina.token).mine();
      const one = await api(marina.token).mineOne(active.body.id);

      expect(mine.status).toBe(200);
      expect(mine.body.map((sheet: { title: string }) => sheet.title)).toEqual([
        "Fase 2",
        "Fase 1",
      ]);
      expect(names(mine.body[0].exercises)).toEqual(["Agachamento", "Supino"]);
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ id: active.body.id, title: "Fase 2", authorName: "rafael" });
    });

    it("o cliente não abre a ficha de outro cliente", async () => {
      const { rafael, marina } = await setup();
      const camila = await createClient("camila");
      const sheet = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
      });

      const other = await api(camila.token).mineOne(sheet.body.id);
      const missing = await api(marina.token).mineOne("nao-existe");

      expect(other.status).toBe(404);
      expect(missing.status).toBe(404);
    });

    it("o cliente não cria, edita, muda o status nem exclui fichas", async () => {
      const { rafael, marina } = await setup();
      const sheet = await api(rafael.token).create({
        clientId: marina.user.id,
        title: "Fase 2",
        exercises: [{ name: "A" }],
      });

      const create = await api(marina.token).create({ clientId: marina.user.id, title: "Minha" });
      const update = await api(marina.token).update(sheet.body.id, { status: "ARCHIVED" });
      const remove = await api(marina.token).remove(sheet.body.id);
      const list = await api(marina.token).list(marina.user.id);

      for (const response of [create, update, remove, list]) {
        expect(response.status).toBe(403);
      }
      const stored = await testPrisma.workoutSheet.findUniqueOrThrow({
        where: { id: sheet.body.id },
      });
      expect(stored).toMatchObject({ title: "Fase 2", status: "ACTIVE" });
    });

    it("exige autenticação", async () => {
      const response = await request(app.getHttpServer()).get("/api/workout-sheets/mine");

      expect(response.status).toBe(401);
    });
  });
});
