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

  describe("Sobreposição (exclusiva por professor)", () => {
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

    it("aceita aulas simultâneas de professores diferentes e recusa a do mesmo professor", async () => {
      const token = await loginAsAdmin();
      const ana = await createStaffUser("ana@fitburn.local", "Ana");
      const bruno = await createStaffUser("bruno@fitburn.local", "Bruno");
      const template = await createTemplate(token, { durationMinutes: 60 });
      const at = (instructorId: string) =>
        api(token)
          .post("/api/occurrences")
          .send({ templateId: template.id, date: "2026-10-05", startTime: "18:00", instructorId });

      const first = await at(ana.id);
      const otherInstructor = await at(bruno.id);
      const sameInstructor = await at(ana.id);

      expect(first.status).toBe(201);
      expect(otherInstructor.status).toBe(201);
      expect(sameInstructor.status).toBe(409);
      expect(sameInstructor.body.code).toBe("OCCURRENCE_OVERLAP");
      expect(sameInstructor.body.details.conflicts.map((c: { id: string }) => c.id)).toEqual([
        first.body.id,
      ]);
    });

    it("com criações concorrentes do mesmo professor no mesmo horário, só uma é aceita (constraint do banco)", async () => {
      const token = await loginAsAdmin();
      const ana = await createStaffUser("ana@fitburn.local", "Ana");
      const template = await createTemplate(token, { durationMinutes: 60 });
      const body = {
        templateId: template.id,
        date: "2026-10-05",
        startTime: "18:00",
        instructorId: ana.id,
      };

      const responses = await Promise.all(
        Array.from({ length: 4 }, () => api(token).post("/api/occurrences").send(body)),
      );

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
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

  describe("Criação recorrente", () => {
    const recurring = (templateId: string, overrides: Record<string, unknown> = {}) => ({
      templateId,
      weekdays: [1, 3], // segunda e quarta
      startTime: "18:00",
      startDate: "2026-10-05",
      endDate: "2026-10-18",
      ...overrides,
    });

    it("materializa uma ocorrência por data, no fuso de São Paulo, ligadas pela mesma série", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });

      const response = await api(token)
        .post("/api/occurrences/recurring")
        .send(recurring(template.id));

      expect(response.status).toBe(201);
      expect(response.body.occurrences.map((o: { startsAt: string }) => o.startsAt)).toEqual([
        "2026-10-05T21:00:00.000Z",
        "2026-10-07T21:00:00.000Z",
        "2026-10-12T21:00:00.000Z",
        "2026-10-14T21:00:00.000Z",
      ]);
      const seriesIds = new Set(
        response.body.occurrences.map((o: { seriesId: string }) => o.seriesId),
      );
      expect([...seriesIds]).toEqual([response.body.seriesId]);
      expect(await testPrisma.classOccurrence.count()).toBe(4);
    });

    it("é atômica: com qualquer conflito nada é criado e todas as datas em conflito voltam", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token, { durationMinutes: 60 });
      const single = (date: string) =>
        api(token)
          .post("/api/occurrences")
          .send({ templateId: template.id, date, startTime: "18:30" });
      const a = await single("2026-10-07");
      const b = await single("2026-10-14");

      const response = await api(token)
        .post("/api/occurrences/recurring")
        .send(recurring(template.id));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("OCCURRENCE_OVERLAP");
      expect(response.body.details.conflicts.map((c: { id: string }) => c.id)).toEqual([
        a.body.id,
        b.body.id,
      ]);
      expect(await testPrisma.classOccurrence.count()).toBe(2);
    });

    it("recusa período acima de 6 meses", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token);

      const response = await api(token)
        .post("/api/occurrences/recurring")
        .send(recurring(template.id, { startDate: "2026-10-05", endDate: "2027-04-06" }));

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("RECURRENCE_HORIZON_EXCEEDED");
    });

    it("aceita exatamente 6 meses", async () => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token);

      const response = await api(token)
        .post("/api/occurrences/recurring")
        .send(
          recurring(template.id, { weekdays: [1], startDate: "2026-10-05", endDate: "2027-04-05" }),
        );

      expect(response.status).toBe(201);
    });

    it.each([
      ["fim antes do início", { startDate: "2026-10-18", endDate: "2026-10-05" }],
      ["sem dias da semana", { weekdays: [] }],
      ["dias da semana repetidos", { weekdays: [1, 1] }],
      [
        "nenhuma data no período",
        { weekdays: [0], startDate: "2026-10-05", endDate: "2026-10-09" },
      ],
    ])("recusa parâmetros inválidos: %s", async (_label, overrides) => {
      const token = await loginAsAdmin();
      const template = await createTemplate(token);

      const response = await api(token)
        .post("/api/occurrences/recurring")
        .send(recurring(template.id, overrides));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_RECURRENCE");
    });
  });

  describe("Manutenção de ocorrências", () => {
    async function setup() {
      const token = await loginAsAdmin();
      const titular = await createStaffUser("rafael@fitburn.local", "Rafael Andrade");
      const substituta = await createStaffUser("camila@fitburn.local", "Camila Rocha");
      const template = await createTemplate(token, {
        durationMinutes: 60,
        defaultInstructorId: titular.id,
      });
      const create = (date: string, startTime: string) =>
        api(token).post("/api/occurrences").send({ templateId: template.id, date, startTime });
      return { token, titular, substituta, template, create };
    }

    it("edita horário, duração e capacidade", async () => {
      const { token, create } = await setup();
      const occurrence = await create("2026-10-05", "18:00");

      const response = await api(token)
        .patch(`/api/occurrences/${occurrence.body.id}`)
        .send({ startTime: "19:00", durationMinutes: 45, capacity: 8 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        startsAt: "2026-10-05T22:00:00.000Z",
        endsAt: "2026-10-05T22:45:00.000Z",
        durationMinutes: 45,
        capacity: 8,
      });
    });

    it("recusa edição que sobrepõe outra aula e aceita mover dentro do próprio horário", async () => {
      const { token, create } = await setup();
      const first = await create("2026-10-05", "18:00");
      const second = await create("2026-10-05", "19:00");

      const overlapping = await api(token)
        .patch(`/api/occurrences/${second.body.id}`)
        .send({ startTime: "18:30" });
      const selfShift = await api(token)
        .patch(`/api/occurrences/${first.body.id}`)
        .send({ durationMinutes: 30 });

      expect(overlapping.status).toBe(409);
      expect(overlapping.body.code).toBe("OCCURRENCE_OVERLAP");
      expect(overlapping.body.details.conflicts.map((c: { id: string }) => c.id)).toEqual([
        first.body.id,
      ]);
      expect(selfShift.status).toBe(200);
    });

    it("substitui o professor de uma única ocorrência da série", async () => {
      const { token, substituta, template } = await setup();
      const series = await api(token)
        .post("/api/occurrences/recurring")
        .send({
          templateId: template.id,
          weekdays: [1],
          startTime: "07:00",
          startDate: "2026-10-05",
          endDate: "2026-10-19",
        });
      const [first, second, third] = series.body.occurrences as Array<{ id: string }>;

      const response = await api(token)
        .patch(`/api/occurrences/${second.id}`)
        .send({ instructorId: substituta.id });

      expect(response.status).toBe(200);
      const list = await api(token).get("/api/occurrences?from=2026-10-05&to=2026-10-19");
      const instructors = Object.fromEntries(
        list.body.map((o: { id: string; instructor: { fullName: string } }) => [
          o.id,
          o.instructor.fullName,
        ]),
      );
      expect(instructors).toEqual({
        [first.id]: "Rafael Andrade",
        [second.id]: "Camila Rocha",
        [third.id]: "Rafael Andrade",
      });
    });

    it("cancelar mantém no histórico e libera o horário", async () => {
      const { token, create } = await setup();
      const occurrence = await create("2026-10-05", "18:00");

      const cancelled = await api(token).post(`/api/occurrences/${occurrence.body.id}/cancel`);
      const replacement = await create("2026-10-05", "18:00");

      expect(cancelled.status).toBe(201);
      expect(cancelled.body.status).toBe("CANCELLED");
      expect(replacement.status).toBe(201);
      const list = await api(token).get("/api/occurrences?from=2026-10-05&to=2026-10-05");
      expect(list.body.map((o: { status: string }) => o.status)).toEqual([
        "CANCELLED",
        "SCHEDULED",
      ]);
    });

    it("não edita nem cancela de novo uma ocorrência cancelada", async () => {
      const { token, create } = await setup();
      const occurrence = await create("2026-10-05", "18:00");
      await api(token).post(`/api/occurrences/${occurrence.body.id}/cancel`);

      const edit = await api(token)
        .patch(`/api/occurrences/${occurrence.body.id}`)
        .send({ capacity: 5 });
      const cancelAgain = await api(token).post(`/api/occurrences/${occurrence.body.id}/cancel`);

      expect(edit.status).toBe(422);
      expect(edit.body.code).toBe("OCCURRENCE_CANCELLED");
      expect(cancelAgain.status).toBe(422);
    });

    it("exclui uma ocorrência", async () => {
      const { token, create } = await setup();
      const occurrence = await create("2026-10-05", "18:00");

      const response = await api(token).delete(`/api/occurrences/${occurrence.body.id}`);

      expect(response.status).toBe(204);
      expect(await testPrisma.classOccurrence.count()).toBe(0);
    });

    it("devolve 404 para ocorrência inexistente", async () => {
      const token = await loginAsAdmin();

      const response = await api(token).patch("/api/occurrences/nao-existe").send({ capacity: 5 });

      expect(response.status).toBe(404);
    });

    it("editar, cancelar e excluir exigem EDIT e DELETE em ocorrências", async () => {
      const { create } = await setup();
      const occurrence = await create("2026-10-05", "18:00");
      const profile = await createAccessProfile({ name: "Recepção" });
      await grantModuleAccess({
        profileId: profile.id,
        module: "OCORRENCIAS",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const user = await createUser({
        email: "recepcao@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
      });
      const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

      const edit = await api(token)
        .patch(`/api/occurrences/${occurrence.body.id}`)
        .send({ capacity: 5 });
      const cancel = await api(token).post(`/api/occurrences/${occurrence.body.id}/cancel`);
      const remove = await api(token).delete(`/api/occurrences/${occurrence.body.id}`);

      expect([edit.status, cancel.status, remove.status]).toEqual([403, 403, 403]);
    });

    it("escopo 'aulas atribuídas' não altera aula de outro professor", async () => {
      const { create } = await setup();
      const occurrence = await create("2026-10-05", "18:00"); // professor: Rafael (titular)
      const profile = await createAccessProfile({ name: "Monitor" });
      await grantModuleAccess({
        profileId: profile.id,
        module: "OCORRENCIAS",
        actions: ["VIEW", "EDIT"],
        scope: "ASSIGNED_CLASSES",
      });
      const monitor = await createUser({
        email: "monitor@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
      });
      const token = await loginAndGetAccessToken(app, monitor.email, PASSWORD);

      const response = await api(token)
        .patch(`/api/occurrences/${occurrence.body.id}`)
        .send({ capacity: 5 });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
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

      const forOther = await api(token).post("/api/occurrences").send({
        templateId: template.id,
        date: "2026-10-05",
        startTime: "07:00",
        instructorId: other.id,
      });
      const forSelf = await api(token).post("/api/occurrences").send({
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
