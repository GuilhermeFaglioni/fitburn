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
const DAY = 24 * 60 * 60_000;

/** Um dia local (AAAA-MM-DD) a `offset` dias de hoje, longe o bastante do fuso para não virar o dia. */
function localDay(offset: number): Date {
  const date = new Date(Date.now() + offset * DAY);
  return new Date(date.toISOString().slice(0, 10));
}

describe("Tela de Clientes (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let clientProfileId: string;
  let teacherProfileId: string;
  let receptionProfileId: string;

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
    receptionProfileId = (await createAccessProfile({ name: "Recepção" })).id;
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "CLIENTES",
      actions: ["VIEW"],
      scope: "ASSIGNED_CLIENTS",
    });
    await grantModuleAccess({
      profileId: receptionProfileId,
      module: "CLIENTES",
      actions: ["VIEW"],
      scope: "ALL",
    });
  });

  async function signIn(
    name: string,
    profileId: string,
    extra: { document?: string; phone?: string } = {},
  ) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: name,
      ...extra,
    });
    return { user, token: await loginAndGetAccessToken(app, user.email, PASSWORD) };
  }

  const createAdmin = () => signIn("admin", adminProfileId);
  const createTeacher = (name: string) => signIn(name, teacherProfileId);
  const createReception = () => signIn("recepcao", receptionProfileId);

  /** Cliente sem sessão aberta (para ler/afetar sem login). */
  function createClientRow(
    name: string,
    extra: { document?: string; phone?: string; status?: "ACTIVE" | "INACTIVE" } = {},
  ) {
    return createUser({
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@fitburn.local`,
      password: PASSWORD,
      profileId: clientProfileId,
      fullName: name,
      ...extra,
    });
  }

  async function givePlan(clientId: string, planName: string, endOffsetDays = 30) {
    const plan = await testPrisma.plan.upsert({
      where: { name: planName },
      update: {},
      create: { name: planName },
    });
    return testPrisma.planAssignment.create({
      data: {
        clientId,
        planId: plan.id,
        startDate: localDay(-10),
        endDate: localDay(endOffsetDays),
        status: "ACTIVE",
      },
    });
  }

  function list(token: string, query = "") {
    return request(app.getHttpServer())
      .get(`/api/clients${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  describe("GET /api/clients", () => {
    it("lista só clientes, em ordem de nome, com contato, status e plano ativo", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina Souza", { phone: "11987654321" });
      await createClientRow("Bruno Lima", { status: "INACTIVE" });
      await createTeacher("rafael");
      await givePlan(marina.id, "Plano Performance");

      const response = await list(admin.token);

      expect(response.status).toBe(200);
      expect(response.body.map((item: { fullName: string }) => item.fullName)).toEqual([
        "Bruno Lima",
        "Marina Souza",
      ]);
      expect(response.body[1]).toEqual({
        id: marina.id,
        fullName: "Marina Souza",
        email: "marina.souza@fitburn.local",
        phone: "11987654321",
        document: null,
        status: "ACTIVE",
        activePlan: {
          name: "Plano Performance",
          endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        },
      });
      expect(response.body[0]).toMatchObject({ status: "INACTIVE", activePlan: null });
    });

    it("não conta como plano ativo o que já terminou nem o encerrado", async () => {
      const admin = await createAdmin();
      const ana = await createClientRow("Ana");
      const carlos = await createClientRow("Carlos");
      await givePlan(ana.id, "Plano Vencido", -2);
      const ended = await givePlan(carlos.id, "Plano Antigo");
      await testPrisma.planAssignment.update({
        where: { id: ended.id },
        data: { status: "ENDED" },
      });

      const response = await list(admin.token);

      expect(response.body.map((item: { activePlan: unknown }) => item.activePlan)).toEqual([
        null,
        null,
      ]);
    });

    it("busca por nome, e-mail ou documento, sem diferenciar maiúsculas", async () => {
      const admin = await createAdmin();
      await createClientRow("Marina Souza", { document: "111.222.333-44" });
      await createClientRow("Rafael Andrade", { document: "555.666.777-88" });
      await createClientRow("Camila Ferreira");

      const byName = await list(admin.token, "?search=MARINA");
      const byEmail = await list(admin.token, "?search=rafael.andrade@");
      const byDocument = await list(admin.token, "?search=555.666");
      const none = await list(admin.token, "?search=inexistente");

      expect(byName.body.map((item: { fullName: string }) => item.fullName)).toEqual([
        "Marina Souza",
      ]);
      expect(byEmail.body.map((item: { fullName: string }) => item.fullName)).toEqual([
        "Rafael Andrade",
      ]);
      expect(byDocument.body.map((item: { fullName: string }) => item.fullName)).toEqual([
        "Rafael Andrade",
      ]);
      expect(none.body).toEqual([]);
    });

    it("trata a busca como texto, não como padrão (% e _ valem por si)", async () => {
      const admin = await createAdmin();
      await createClientRow("Ana 100%");
      await createClientRow("Ana Souza");

      const response = await list(admin.token, `?search=${encodeURIComponent("100%")}`);

      expect(response.body.map((item: { fullName: string }) => item.fullName)).toEqual([
        "Ana 100%",
      ]);
    });

    it("filtra por status", async () => {
      const admin = await createAdmin();
      await createClientRow("Ativa");
      await createClientRow("Inativo", { status: "INACTIVE" });

      const active = await list(admin.token, "?status=ACTIVE");
      const inactive = await list(admin.token, "?status=INACTIVE");
      const invalid = await list(admin.token, "?status=QUALQUER");

      expect(active.body.map((item: { fullName: string }) => item.fullName)).toEqual(["Ativa"]);
      expect(inactive.body.map((item: { fullName: string }) => item.fullName)).toEqual(["Inativo"]);
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe("VALIDATION_ERROR");
    });

    it("recusa quem não tem permissão de ver clientes", async () => {
      const outsider = await signIn(
        "sem-acesso",
        (await createAccessProfile({ name: "Vazio" })).id,
      );
      const client = await signIn("cliente", clientProfileId);

      const asOutsider = await list(outsider.token);
      const asClient = await list(client.token);

      expect(asOutsider.status).toBe(403);
      expect(asClient.status).toBe(403);
    });
  });

  describe("Escopo do professor", () => {
    it("o professor vê só os clientes atribuídos e os das suas aulas", async () => {
      const rafael = await createTeacher("rafael");
      const other = await createTeacher("outro");
      const assigned = await createClientRow("Atribuída");
      const booked = await createClientRow("Da Aula");
      const cancelled = await createClientRow("Cancelou");
      await createClientRow("Alheia");
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: assigned.id },
      });
      const mine = await createOccurrence(new Date(Date.now() + DAY), {
        instructorId: rafael.user.id,
      });
      const theirs = await createOccurrence(new Date(Date.now() + 3 * DAY), {
        instructorId: other.user.id,
        name: "Yoga",
      });
      await createReservation(booked.id, mine.id);
      await createReservation(cancelled.id, mine.id, "CANCELLED");
      await createReservation(cancelled.id, theirs.id);

      const response = await list(rafael.token);

      expect(response.status).toBe(200);
      expect(response.body.map((item: { fullName: string }) => item.fullName).sort()).toEqual([
        "Atribuída",
        "Da Aula",
      ]);
    });

    it("a busca e o filtro continuam dentro do escopo", async () => {
      const rafael = await createTeacher("rafael");
      const mine = await createClientRow("Marina Minha");
      await createClientRow("Marina Alheia");
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: mine.id },
      });

      const response = await list(rafael.token, "?search=marina&status=ACTIVE");

      expect(response.body.map((item: { fullName: string }) => item.fullName)).toEqual([
        "Marina Minha",
      ]);
    });
  });

  describe("Detalhe do cliente", () => {
    function detail(token: string, clientId: string, tab = "") {
      return request(app.getHttpServer())
        .get(`/api/clients/${clientId}${tab}`)
        .set("Authorization", `Bearer ${token}`);
    }

    it("traz os dados pessoais, a situação e o plano ativo", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina Souza", {
        phone: "11987654321",
        document: "111.222.333-44",
      });
      await testPrisma.user.update({
        where: { id: marina.id },
        data: { birthDate: new Date("1992-03-15"), address: "Rua das Flores, 10" },
      });
      await givePlan(marina.id, "Plano Performance");

      const response = await detail(admin.token, marina.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: marina.id,
        fullName: "Marina Souza",
        email: "marina.souza@fitburn.local",
        phone: "11987654321",
        document: "111.222.333-44",
        birthDate: "1992-03-15",
        address: "Rua das Flores, 10",
        status: "ACTIVE",
        activePlan: { name: "Plano Performance", endDate: expect.any(String) },
        createdAt: expect.any(String),
      });
    });

    it("responde 404 para quem não existe ou não é cliente", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");

      const unknown = await detail(admin.token, "00000000-0000-0000-0000-000000000000");
      const staff = await detail(admin.token, rafael.user.id);

      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe("NOT_FOUND");
      expect(staff.status).toBe(404);
    });

    it("um cliente fora do escopo do professor responde 403 OUT_OF_SCOPE, em todas as abas", async () => {
      const rafael = await createTeacher("rafael");
      const mine = await createClientRow("Minha");
      const alheia = await createClientRow("Alheia");
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: mine.id },
      });

      for (const tab of ["", "/plan", "/reservations", "/gamification", "/workout-sheets"]) {
        const inScope = await detail(rafael.token, mine.id, tab);
        const outOfScope = await detail(rafael.token, alheia.id, tab);

        expect(inScope.status, `aba "${tab}" no escopo`).toBe(200);
        expect(outOfScope.status, `aba "${tab}" fora do escopo`).toBe(403);
        expect(outOfScope.body.code).toBe("OUT_OF_SCOPE");
      }
    });

    it("recusa quem não tem permissão de ver clientes", async () => {
      const client = await signIn("cliente", clientProfileId);

      const response = await detail(client.token, client.user.id);

      expect(response.status).toBe(403);
    });

    it("aba de plano: o ativo e o histórico, do mais recente para o mais antigo", async () => {
      const reception = await createReception();
      const marina = await createClientRow("Marina");
      const old = await givePlan(marina.id, "Plano Essencial", -5);
      await testPrisma.planAssignment.update({
        where: { id: old.id },
        data: { status: "ENDED", startDate: localDay(-100), endDate: localDay(-40) },
      });
      await givePlan(marina.id, "Plano Performance");

      const response = await detail(reception.token, marina.id, "/plan");

      expect(response.status).toBe(200);
      expect(response.body.active).toMatchObject({
        plan: { name: "Plano Performance" },
        status: "ACTIVE",
      });
      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0]).toMatchObject({
        plan: { name: "Plano Essencial" },
        status: "ENDED",
      });
    });

    it("aba de plano de quem não tem plano: nenhum ativo e histórico vazio", async () => {
      const reception = await createReception();
      const bruno = await createClientRow("Bruno");

      const response = await detail(reception.token, bruno.id, "/plan");

      expect(response.body).toEqual({ active: null, history: [] });
    });

    it("aba de reservas: próximas e anteriores, com filtro de estado", async () => {
      const reception = await createReception();
      const marina = await createClientRow("Marina");
      const future = await createOccurrence(new Date(Date.now() + 2 * DAY), { name: "Yoga" });
      const futureCancelled = await createOccurrence(new Date(Date.now() + 3 * DAY), {
        name: "Pilates",
      });
      const past = await createOccurrence(new Date(Date.now() - 3 * DAY), { name: "Spinning" });
      await createReservation(marina.id, future.id);
      await createReservation(marina.id, futureCancelled.id, "CANCELLED");
      await createReservation(marina.id, past.id, "COMPLETED");

      const upcoming = await detail(reception.token, marina.id, "/reservations?when=upcoming");
      const upcomingCancelled = await detail(
        reception.token,
        marina.id,
        "/reservations?when=upcoming&status=CANCELLED",
      );
      const previous = await detail(reception.token, marina.id, "/reservations?when=past");
      const defaults = await detail(reception.token, marina.id, "/reservations");

      expect(
        upcoming.body.map((item: { occurrence: { name: string } }) => item.occurrence.name),
      ).toEqual(["Yoga", "Pilates"]);
      expect(upcomingCancelled.body.map((item: { status: string }) => item.status)).toEqual([
        "CANCELLED",
      ]);
      expect(
        previous.body.map((item: { occurrence: { name: string } }) => item.occurrence.name),
      ).toEqual(["Spinning"]);
      expect(defaults.body).toHaveLength(2);
    });

    it("aba de reservas não mostra as de outro cliente", async () => {
      const reception = await createReception();
      const marina = await createClientRow("Marina");
      const bruno = await createClientRow("Bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 2 * DAY));
      await createReservation(bruno.id, occurrence.id);

      const response = await detail(reception.token, marina.id, "/reservations");

      expect(response.body).toEqual([]);
    });

    it("aba de gamificação: pontos, streak e badges do cliente", async () => {
      const reception = await createReception();
      const marina = await createClientRow("Marina");
      await testPrisma.pointsEntry.createMany({
        data: [
          { clientId: marina.id, type: "ATTENDANCE", points: 10, occurredAt: new Date() },
          {
            clientId: marina.id,
            type: "ATTENDANCE",
            points: 10,
            occurredAt: new Date(Date.now() - DAY),
          },
        ],
      });

      const response = await detail(reception.token, marina.id, "/gamification");

      expect(response.status).toBe(200);
      expect(response.body.totalPoints).toBe(20);
      expect(response.body.history).toHaveLength(2);
      expect(response.body.badges.length).toBeGreaterThan(0);
    });

    it("aba de fichas: as fichas do cliente com o nome de quem as montou", async () => {
      const reception = await createReception();
      const rafael = await createTeacher("rafael");
      const marina = await createClientRow("Marina");
      const bruno = await createClientRow("Bruno");
      await testPrisma.workoutSheet.create({
        data: {
          clientId: marina.id,
          authorId: rafael.user.id,
          title: "Treino A",
          exercises: { create: [{ position: 0, name: "Agachamento", sets: "4" }] },
        },
      });
      await testPrisma.workoutSheet.create({
        data: { clientId: bruno.id, authorId: rafael.user.id, title: "Treino do Bruno" },
      });

      const response = await detail(reception.token, marina.id, "/workout-sheets");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        title: "Treino A",
        authorName: "rafael",
        exercises: [{ name: "Agachamento" }],
      });
    });
  });

  describe("Cadastro e edição", () => {
    const validBody = {
      fullName: "Nova Cliente",
      email: "nova@fitburn.local",
      phone: "11999990000",
      birthDate: "1995-08-01",
      document: "999.888.777-66",
      address: "Rua Nova, 1",
      password: PASSWORD,
    };

    function create(token: string, body: Record<string, unknown> = validBody) {
      return request(app.getHttpServer())
        .post("/api/clients")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    function edit(token: string, clientId: string, body: Record<string, unknown>) {
      return request(app.getHttpServer())
        .patch(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    /** Professor com permissão de editar e cadastrar, mas só no seu escopo. */
    async function createScopedEditor() {
      const profile = await createAccessProfile({ name: "Professor editor" });
      await grantModuleAccess({
        profileId: profile.id,
        module: "CLIENTES",
        actions: ["VIEW", "CREATE", "EDIT"],
        scope: "ASSIGNED_CLIENTS",
      });
      return signIn("editor", profile.id);
    }

    it("cadastra um cliente com o perfil Cliente, ativo, e ele já consegue entrar", async () => {
      const admin = await createAdmin();

      const response = await create(admin.token);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        fullName: "Nova Cliente",
        email: "nova@fitburn.local",
        phone: "11999990000",
        birthDate: "1995-08-01",
        document: "999.888.777-66",
        address: "Rua Nova, 1",
        status: "ACTIVE",
        activePlan: null,
      });
      const stored = await testPrisma.user.findUniqueOrThrow({
        where: { id: response.body.id },
        include: { profile: true },
      });
      expect(stored.profile.name).toBe("Cliente");
      expect(stored.passwordHash).not.toBe(PASSWORD);
      expect(await loginAndGetAccessToken(app, validBody.email, PASSWORD)).toEqual(
        expect.any(String),
      );
    });

    it("recusa dados incompletos ou inválidos com VALIDATION_ERROR", async () => {
      const admin = await createAdmin();

      const missing = await create(admin.token, { ...validBody, phone: "" });
      const badEmail = await create(admin.token, { ...validBody, email: "não-é-email" });
      const shortPassword = await create(admin.token, { ...validBody, password: "curta" });

      for (const response of [missing, badEmail, shortPassword]) {
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("VALIDATION_ERROR");
      }
    });

    it("recusa e-mail e documento já em uso, inclusive de um cliente inativo", async () => {
      const admin = await createAdmin();
      await createClientRow("Existente", { document: validBody.document, status: "INACTIVE" });
      await createUser({
        email: validBody.email,
        password: PASSWORD,
        profileId: clientProfileId,
      });

      const email = await create(admin.token, { ...validBody, document: "000" });
      const document = await create(admin.token, { ...validBody, email: "outro@fitburn.local" });

      expect(email.status).toBe(409);
      expect(email.body.code).toBe("EMAIL_ALREADY_IN_USE");
      expect(document.status).toBe(409);
      expect(document.body.code).toBe("DOCUMENT_ALREADY_IN_USE");
    });

    it("dois cadastros simultâneos com o mesmo e-mail: um vence, o outro recebe 409 (nunca 500)", async () => {
      const admin = await createAdmin();

      const results = await Promise.all([
        create(admin.token, { ...validBody, document: "111" }),
        create(admin.token, { ...validBody, document: "222" }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      const refused = results.find((result) => result.status === 409)!;
      expect(refused.body.code).toBe("EMAIL_ALREADY_IN_USE");
    });

    it("dois cadastros simultâneos com o mesmo documento: um vence, o outro recebe 409 (nunca 500)", async () => {
      const admin = await createAdmin();

      const results = await Promise.all([
        create(admin.token, { ...validBody, email: "a@fitburn.local" }),
        create(admin.token, { ...validBody, email: "b@fitburn.local" }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      const refused = results.find((result) => result.status === 409)!;
      expect(refused.body.code).toBe("DOCUMENT_ALREADY_IN_USE");
    });

    it("cadastrar exige a permissão de criar e acesso a todos os clientes", async () => {
      const reception = await createReception();
      const editor = await createScopedEditor();

      const withoutPermission = await create(reception.token);
      const scoped = await create(editor.token);

      expect(withoutPermission.status).toBe(403);
      expect(scoped.status).toBe(403);
      expect(scoped.body.code).toBe("OUT_OF_SCOPE");
      expect(await testPrisma.user.count({ where: { email: validBody.email } })).toBe(0);
    });

    it("edita os dados pessoais e devolve o detalhe atualizado", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina Souza", {
        document: "111",
        phone: "1100000000",
      });

      const response = await edit(admin.token, marina.id, {
        fullName: "Marina S. Andrade",
        phone: "11911112222",
        birthDate: "1990-01-02",
        address: "Av. Central, 5",
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: marina.id,
        fullName: "Marina S. Andrade",
        phone: "11911112222",
        birthDate: "1990-01-02",
        address: "Av. Central, 5",
        document: "111",
        email: "marina.souza@fitburn.local",
      });
    });

    it("mantém o próprio e-mail e documento sem acusar conflito, e recusa os de outro cliente", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina", { document: "111" });
      await createClientRow("Bruno", { document: "222" });

      const same = await edit(admin.token, marina.id, {
        email: "marina@fitburn.local",
        document: "111",
      });
      const email = await edit(admin.token, marina.id, { email: "bruno@fitburn.local" });
      const document = await edit(admin.token, marina.id, { document: "222" });

      expect(same.status).toBe(200);
      expect(email.status).toBe(409);
      expect(email.body.code).toBe("EMAIL_ALREADY_IN_USE");
      expect(document.status).toBe(409);
      expect(document.body.code).toBe("DOCUMENT_ALREADY_IN_USE");
    });

    it("duas edições simultâneas para o mesmo e-mail: uma vence, a outra recebe 409 (nunca 500)", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina");
      const bruno = await createClientRow("Bruno");

      const results = await Promise.all([
        edit(admin.token, marina.id, { email: "livre@fitburn.local" }),
        edit(admin.token, bruno.id, { email: "livre@fitburn.local" }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    });

    it("não deixa editar status, perfil ou senha por aqui, nem esvaziar campos obrigatórios", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina");

      const status = await edit(admin.token, marina.id, { status: "INACTIVE" });
      const profile = await edit(admin.token, marina.id, { profileId: adminProfileId });
      const password = await edit(admin.token, marina.id, { password: "NovaSenha123!" });
      const empty = await edit(admin.token, marina.id, { phone: "" });

      for (const response of [status, profile, password, empty]) {
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("VALIDATION_ERROR");
      }
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: marina.id } });
      expect(stored.status).toBe("ACTIVE");
      expect(stored.profileId).toBe(clientProfileId);
    });

    it("editar respeita a permissão, o escopo e o tipo de usuário", async () => {
      const reception = await createReception();
      const editor = await createScopedEditor();
      const admin = await createAdmin();
      const mine = await createClientRow("Minha");
      const alheia = await createClientRow("Alheia");
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: editor.user.id, clientId: mine.id },
      });

      const withoutPermission = await edit(reception.token, mine.id, { fullName: "X" });
      const inScope = await edit(editor.token, mine.id, { fullName: "Minha Editada" });
      const outOfScope = await edit(editor.token, alheia.id, { fullName: "X" });
      const staff = await edit(admin.token, editor.user.id, { fullName: "X" });

      expect(withoutPermission.status).toBe(403);
      expect(inScope.status).toBe(200);
      expect(outOfScope.status).toBe(403);
      expect(outOfScope.body.code).toBe("OUT_OF_SCOPE");
      expect(staff.status).toBe(404);
      const untouched = await testPrisma.user.findUniqueOrThrow({ where: { id: alheia.id } });
      expect(untouched.fullName).toBe("Alheia");
    });
  });

  describe("Desativar e reativar", () => {
    function deactivate(token: string, clientId: string) {
      return request(app.getHttpServer())
        .post(`/api/clients/${clientId}/deactivate`)
        .set("Authorization", `Bearer ${token}`);
    }

    function reactivate(token: string, clientId: string) {
      return request(app.getHttpServer())
        .post(`/api/clients/${clientId}/reactivate`)
        .set("Authorization", `Bearer ${token}`);
    }

    it("desativar bloqueia o login e encerra as sessões, mas mantém as reservas existentes", async () => {
      const admin = await createAdmin();
      const marina = await signIn("marina", clientProfileId);
      const occurrence = await createOccurrence(new Date(Date.now() + 2 * DAY));
      const reservation = await createReservation(marina.user.id, occurrence.id);

      const response = await deactivate(admin.token, marina.user.id);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: marina.user.id, status: "INACTIVE" });
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: marina.user.email, password: PASSWORD });
      expect(login.status).toBe(401);
      expect(login.body.code).toBe("USER_INACTIVE");
      expect(
        await testPrisma.refreshToken.count({ where: { userId: marina.user.id, revokedAt: null } }),
      ).toBe(0);
      const kept = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(kept.status).toBe("CONFIRMED");
      expect(kept.cancelledAt).toBeNull();
    });

    it("um cliente desativado não consegue reservar, nem com o token que já tinha", async () => {
      const admin = await createAdmin();
      const marina = await signIn("marina", clientProfileId);
      const occurrence = await createOccurrence(new Date(Date.now() + 2 * DAY));

      await deactivate(admin.token, marina.user.id);
      const attempt = await request(app.getHttpServer())
        .post("/api/reservations")
        .set("Authorization", `Bearer ${marina.token}`)
        .set("Idempotency-Key", "8d1a5c2e-3b4f-4a6d-9e7c-0a1b2c3d4e5f")
        .send({ occurrenceId: occurrence.id });

      expect(attempt.status).toBe(403);
      expect(attempt.body.code).toBe("USER_INACTIVE");
      expect(await testPrisma.reservation.count({ where: { clientId: marina.user.id } })).toBe(0);
    });

    it("as reservas de um cliente desativado seguem visíveis na aba de reservas", async () => {
      const admin = await createAdmin();
      const marina = await createClientRow("Marina");
      const occurrence = await createOccurrence(new Date(Date.now() + 2 * DAY));
      await createReservation(marina.id, occurrence.id);
      await deactivate(admin.token, marina.id);

      const response = await request(app.getHttpServer())
        .get(`/api/clients/${marina.id}/reservations`)
        .set("Authorization", `Bearer ${admin.token}`);

      expect(response.body.map((item: { status: string }) => item.status)).toEqual(["CONFIRMED"]);
    });

    it("reativar devolve o acesso; repetir a ação é inofensivo", async () => {
      const admin = await createAdmin();
      const bruno = await createClientRow("Bruno", { status: "INACTIVE" });

      const first = await reactivate(admin.token, bruno.id);
      const second = await reactivate(admin.token, bruno.id);
      const again = await deactivate(admin.token, bruno.id);
      const twice = await deactivate(admin.token, bruno.id);

      expect(first.status).toBe(200);
      expect(first.body.status).toBe("ACTIVE");
      expect(second.status).toBe(200);
      expect(again.body.status).toBe("INACTIVE");
      expect(twice.status).toBe(200);
      await reactivate(admin.token, bruno.id);
      expect(await loginAndGetAccessToken(app, bruno.email, PASSWORD)).toEqual(expect.any(String));
    });

    it("exige a permissão de editar, o escopo, e só vale para clientes", async () => {
      const reception = await createReception();
      const admin = await createAdmin();
      const editorProfile = await createAccessProfile({ name: "Professor editor" });
      await grantModuleAccess({
        profileId: editorProfile.id,
        module: "CLIENTES",
        actions: ["VIEW", "EDIT"],
        scope: "ASSIGNED_CLIENTS",
      });
      const editor = await signIn("editor", editorProfile.id);
      const alheia = await createClientRow("Alheia");

      const withoutPermission = await deactivate(reception.token, alheia.id);
      const outOfScope = await deactivate(editor.token, alheia.id);
      const staff = await deactivate(admin.token, editor.user.id);
      const unknown = await reactivate(admin.token, "00000000-0000-0000-0000-000000000000");

      expect(withoutPermission.status).toBe(403);
      expect(outOfScope.status).toBe(403);
      expect(outOfScope.body.code).toBe("OUT_OF_SCOPE");
      expect(staff.status).toBe(404);
      expect(unknown.status).toBe(404);
      const untouched = await testPrisma.user.findUniqueOrThrow({ where: { id: alheia.id } });
      expect(untouched.status).toBe("ACTIVE");
    });
  });
});
