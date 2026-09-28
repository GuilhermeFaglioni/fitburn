import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Ocorrências avulsas e agenda administrativa (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  function api(token: string) {
    const server = app.getHttpServer();
    const withAuth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);
    return {
      get: (url: string) => withAuth(request(server).get(url)),
      post: (url: string) => withAuth(request(server).post(url)),
      patch: (url: string) => withAuth(request(server).patch(url)),
      delete: (url: string) => withAuth(request(server).delete(url)),
    };
  }

  async function loginAsAdmin() {
    const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const user = await createUser({
      email: "admin@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  async function createStaffUser(email: string, fullName: string) {
    const profile =
      (await testPrisma.accessProfile.findUnique({ where: { name: "Professor" } })) ??
      (await createAccessProfile({ name: "Professor" }));
    return createUser({ email, password: PASSWORD, profileId: profile.id, fullName });
  }

  async function createTemplate(
    token: string,
    overrides: { durationMinutes?: number; capacity?: number; defaultInstructorId?: string } = {},
  ) {
    const modality = await api(token)
      .post("/api/modalities")
      .send({ name: `Modalidade ${Math.random()}` });
    const template = await api(token)
      .post("/api/class-templates")
      .send({
        name: "Treino Funcional",
        description: "Circuito multiarticular",
        durationMinutes: overrides.durationMinutes ?? 60,
        capacity: overrides.capacity ?? 10,
        modalityId: modality.body.id,
        defaultInstructorId: overrides.defaultInstructorId,
      });
    expect(template.status).toBe(201);
    return template.body as { id: string; modality: { id: string; name: string } };
  }

  describe("Criação avulsa", () => {
    it("cria a ocorrência copiando duração, capacidade, modalidade e professor do template", async () => {
      const token = await loginAsAdmin();
      const instructor = await createStaffUser("rafael@fitburn.local", "Rafael Andrade");
      const template = await createTemplate(token, {
        durationMinutes: 50,
        capacity: 10,
        defaultInstructorId: instructor.id,
      });

      const response = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "18:00" });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        templateId: template.id,
        name: "Treino Funcional",
        description: "Circuito multiarticular",
        modality: template.modality,
        instructor: { id: instructor.id, fullName: "Rafael Andrade" },
        durationMinutes: 50,
        capacity: 10,
        bookedCount: 0,
        status: "SCHEDULED",
        // 18:00 em São Paulo (UTC−3)
        startsAt: "2026-10-05T21:00:00.000Z",
        endsAt: "2026-10-05T21:50:00.000Z",
      });
    });

    it("permite ajustar professor e capacidade na criação", async () => {
      const token = await loginAsAdmin();
      const titular = await createStaffUser("rafael@fitburn.local", "Rafael Andrade");
      const substituta = await createStaffUser("camila@fitburn.local", "Camila Rocha");
      const template = await createTemplate(token, {
        capacity: 10,
        defaultInstructorId: titular.id,
      });

      const response = await api(token).post("/api/occurrences").send({
        templateId: template.id,
        date: "2026-10-05",
        startTime: "07:00",
        instructorId: substituta.id,
        capacity: 14,
      });

      expect(response.status).toBe(201);
      expect(response.body.instructor).toEqual({ id: substituta.id, fullName: "Camila Rocha" });
      expect(response.body.capacity).toBe(14);
    });

    it("editar o template não altera ocorrências já criadas", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60, capacity: 10 });
      const created = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "07:00" });

      await api(token)
        .patch(`/api/class-templates/${template.id}`)
        .send({ name: "Novo nome", durationMinutes: 30, capacity: 20 });

      const list = await api(token).get("/api/occurrences?from=2026-10-05&to=2026-10-05");
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        id: created.body.id,
        name: "Treino Funcional",
        durationMinutes: 60,
        capacity: 10,
      });
    });
  });

  describe("Sobreposição (espaço exclusivo)", () => {
    it("recusa ocorrência que se sobrepõe a outra e devolve o intervalo em conflito", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });
      const first = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "18:00" });

      const response = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "18:30" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("OCCURRENCE_OVERLAP");
      expect(response.body.details.conflicts).toEqual([
        {
          id: first.body.id,
          name: "Treino Funcional",
          startsAt: "2026-10-05T21:00:00.000Z",
          endsAt: "2026-10-05T22:00:00.000Z",
        },
      ]);
    });

    it("aceita uma aula começando exatamente quando a anterior termina", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });
      await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "18:00" });

      const response = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "19:00" });

      expect(response.status).toBe(201);
    });

    it("com duas criações concorrentes no mesmo horário, só uma é aceita", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });
      const body = { templateId: template.id, date: "2026-10-05", startTime: "18:00" };

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => api(token).post("/api/occurrences").send(body)),
      );

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      expect(
        responses
          .filter((r) => r.status === 409)
          .every((r) => r.body.code === "OCCURRENCE_OVERLAP"),
      ).toBe(true);
      expect(await testPrisma.classOccurrence.count()).toBe(1);
    });

    it("ocorrência cancelada não bloqueia o horário", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });
      const first = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "18:00" });
      await testPrisma.classOccurrence.update({
        where: { id: first.body.id },
        data: { status: "CANCELLED" },
      });

      const response = await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "18:00" });

      expect(response.status).toBe(201);
    });
  });

  describe("Listagem e opções", () => {
    it("lista por intervalo de dias locais, incluindo canceladas", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });
      const create = (date: string, startTime: string) =>
        api(token).post("/api/occurrences").send({ templateId: template.id, date, startTime });
      await create("2026-10-04", "23:00"); // domingo à noite: fora
      const inside = await create("2026-10-05", "00:30");
      const cancelled = await create("2026-10-11", "23:00");
      await create("2026-10-12", "07:00"); // segunda seguinte: fora
      await testPrisma.classOccurrence.update({
        where: { id: cancelled.body.id },
        data: { status: "CANCELLED" },
      });

      const response = await api(token).get("/api/occurrences?from=2026-10-05&to=2026-10-11");

      expect(response.status).toBe(200);
      expect(response.body.map((o: { id: string }) => o.id)).toEqual([
        inside.body.id,
        cancelled.body.id,
      ]);
      expect(response.body[1].status).toBe("CANCELLED");
    });

    it("recusa listagem sem intervalo válido", async () => {
      const token = await loginAsAdmin();

      const response = await api(token).get("/api/occurrences?from=ontem");

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("devolve só templates ativos e os professores nas opções do formulário", async () => {
      const token = await loginAsAdmin();
      const active = await createTemplate(token);
      const inactive = await createTemplate(token);
      await api(token).post(`/api/class-templates/${inactive.id}/deactivate`);
      await createStaffUser("camila@fitburn.local", "Camila Rocha");

      const response = await api(token).get("/api/occurrences/options");

      expect(response.status).toBe(200);
      expect(response.body.templates.map((t: { id: string }) => t.id)).toEqual([active.id]);
      expect(response.body.instructors.map((i: { fullName: string }) => i.fullName)).toContain(
        "Camila Rocha",
      );
    });
  });

  describe("Template em uso", () => {
    it("recusa excluir template com ocorrências vinculadas", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token);
      await api(token)
        .post("/api/occurrences")
        .send({ templateId: template.id, date: "2026-10-05", startTime: "07:00" });

      const response = await api(token).delete(`/api/class-templates/${template.id}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("TEMPLATE_IN_USE");
      expect(response.body.details).toEqual({ occurrenceCount: 1 });
    });
  });

  describe("Permissões", () => {
    async function loginAsProfessor(
      email: string,
      fullName: string,
      scope: "ALL" | "ASSIGNED_CLASSES",
    ) {
      const profile =
        (await testPrisma.accessProfile.findUnique({ where: { name: "Professor" } })) ??
        (await createAccessProfile({ name: "Professor" }));
      await grantModuleAccess({
        profileId: profile.id,
        module: "OCORRENCIAS",
        actions: ["VIEW"],
        scope,
      });
      const user = await createUser({ email, password: PASSWORD, profileId: profile.id, fullName });
      return { user, token: await loginAndGetAccessToken(app, email, PASSWORD) };
    }

    it("perfil sem 'ocorrências/agendamento' recebe 403", async () => {
      const profile = await createAccessProfile({ name: "Recepção" });
      const user = await createUser({
        email: "recepcao@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
      });
      const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

      const list = await api(token).get("/api/occurrences?from=2026-10-05&to=2026-10-11");
      const create = await api(token)
        .post("/api/occurrences")
        .send({ templateId: "x", date: "2026-10-05", startTime: "07:00" });

      expect(list.status).toBe(403);
      expect(create.status).toBe(403);
    });

    it("cliente não cria ocorrência", async () => {
      const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const user = await createUser({
        email: "cliente@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
      });
      const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

      const create = await api(token)
        .post("/api/occurrences")
        .send({ templateId: "x", date: "2026-10-05", startTime: "07:00" });

      expect(create.status).toBe(403);
    });

    it("escopo 'aulas atribuídas' só cria aula em que é o professor", async () => {
      const adminToken = await loginAsAdmin();
      const template = await createTemplate(adminToken);
      const profile = await createAccessProfile({ name: "Professor" });
      await grantModuleAccess({
        profileId: profile.id,
        module: "OCORRENCIAS",
        actions: ["VIEW", "CREATE"],
        scope: "ASSIGNED_CLASSES",
      });
      const rafael = await createUser({
        email: "rafael@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
        fullName: "Rafael Andrade",
      });
      const token = await loginAndGetAccessToken(app, rafael.email, PASSWORD);
      const other = await createStaffUser("camila@fitburn.local", "Camila Rocha");

      const forOther = await api(token)
        .post("/api/occurrences")
        .send({
          templateId: template.id,
          date: "2026-10-05",
          startTime: "07:00",
          instructorId: other.id,
        });
      const forSelf = await api(token)
        .post("/api/occurrences")
        .send({
          templateId: template.id,
          date: "2026-10-05",
          startTime: "09:00",
          instructorId: rafael.id,
        });

      expect(forOther.status).toBe(403);
      expect(forOther.body.code).toBe("OUT_OF_SCOPE");
      expect(forSelf.status).toBe(201);
    });

    it("escopo 'aulas atribuídas' vê só as ocorrências em que é o professor", async () => {
      const adminToken = await loginAsAdmin();
      const { user: rafael, token } = await loginAsProfessor(
        "rafael@fitburn.local",
        "Rafael Andrade",
        "ASSIGNED_CLASSES",
      );
      const other = await createStaffUser("camila@fitburn.local", "Camila Rocha");
      const template = await createTemplate(adminToken);
      const mine = await api(adminToken).post("/api/occurrences").send({
        templateId: template.id,
        date: "2026-10-05",
        startTime: "07:00",
        instructorId: rafael.id,
      });
      await api(adminToken).post("/api/occurrences").send({
        templateId: template.id,
        date: "2026-10-05",
        startTime: "09:00",
        instructorId: other.id,
      });

      const response = await api(token).get("/api/occurrences?from=2026-10-05&to=2026-10-05");

      expect(response.status).toBe(200);
      expect(response.body.map((o: { id: string }) => o.id)).toEqual([mine.body.id]);
    });
  });
});
