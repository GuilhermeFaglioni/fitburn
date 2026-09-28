import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Catálogo de modalidades e templates (HTTP)", () => {
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

  async function loginAsAdmin() {
    const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const user = await createUser({
      email: "admin@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { profile, user, token };
  }

  describe("Modalidades", () => {
    it("cria uma modalidade e a devolve na listagem", async () => {
      const { token } = await loginAsAdmin();

      const created = await request(app.getHttpServer())
        .post("/api/modalities")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Spinning", description: "Aula em bicicleta ergométrica" });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: "Spinning",
        description: "Aula em bicicleta ergométrica",
        isActive: true,
        templateCount: 0,
        activeTemplateCount: 0,
      });

      const list = await request(app.getHttpServer())
        .get("/api/modalities")
        .set("Authorization", `Bearer ${token}`);

      expect(list.status).toBe(200);
      expect(list.body.map((m: { name: string }) => m.name)).toEqual(["Spinning"]);
    });

    it("recusa nome de modalidade duplicado", async () => {
      const { token } = await loginAsAdmin();
      await createModality(token, "Yoga");

      const response = await api(token).post("/api/modalities").send({ name: "Yoga" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("edita nome e descrição", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Yoga");

      const response = await api(token)
        .patch(`/api/modalities/${modality.id}`)
        .send({ name: "Yoga suave", description: "Posturas e respiração" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: "Yoga suave",
        description: "Posturas e respiração",
      });
    });

    it("desativa e reativa uma modalidade", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Yoga");

      const deactivated = await api(token).post(`/api/modalities/${modality.id}/deactivate`);
      expect(deactivated.status).toBe(201);
      expect(deactivated.body.isActive).toBe(false);

      const activated = await api(token).post(`/api/modalities/${modality.id}/activate`);
      expect(activated.status).toBe(201);
      expect(activated.body.isActive).toBe(true);
    });
  });

  describe("Templates de aula", () => {
    it("cria um template com professor padrão e o devolve com modalidade e professor", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Spinning");
      const instructor = await createStaffUser("camila@fitburn.local", "Camila Rocha");

      const created = await api(token).post("/api/class-templates").send({
        name: "Spinning 45min",
        description: "Aula de alta intensidade",
        durationMinutes: 45,
        capacity: 15,
        modalityId: modality.id,
        defaultInstructorId: instructor.id,
      });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: "Spinning 45min",
        description: "Aula de alta intensidade",
        durationMinutes: 45,
        capacity: 15,
        isActive: true,
        modality: { id: modality.id, name: "Spinning" },
        defaultInstructor: { id: instructor.id, fullName: "Camila Rocha" },
      });

      const list = await api(token).get("/api/class-templates");
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
    });

    it("aceita template sem professor padrão", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Yoga");

      const created = await api(token)
        .post("/api/class-templates")
        .send({ name: "Yoga suave", durationMinutes: 60, capacity: 12, modalityId: modality.id });

      expect(created.status).toBe(201);
      expect(created.body.defaultInstructor).toBeNull();
    });

    it("recusa um cliente como professor padrão", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Yoga");
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const client = await createUser({
        email: "cliente@fitburn.local",
        password: PASSWORD,
        profileId: clientProfile.id,
      });

      const response = await api(token).post("/api/class-templates").send({
        name: "Yoga suave",
        durationMinutes: 60,
        capacity: 12,
        modalityId: modality.id,
        defaultInstructorId: client.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("recusa template em modalidade inativa", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Yoga");
      await api(token).post(`/api/modalities/${modality.id}/deactivate`);

      const response = await api(token)
        .post("/api/class-templates")
        .send({ name: "Yoga suave", durationMinutes: 60, capacity: 12, modalityId: modality.id });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("edita, desativa, reativa e exclui um template sem uso", async () => {
      const { token } = await loginAsAdmin();
      const template = await createTemplate(token);

      const edited = await api(token)
        .patch(`/api/class-templates/${template.id}`)
        .send({ durationMinutes: 50, capacity: 10 });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ durationMinutes: 50, capacity: 10 });

      const deactivated = await api(token).post(`/api/class-templates/${template.id}/deactivate`);
      expect(deactivated.body.isActive).toBe(false);
      const activated = await api(token).post(`/api/class-templates/${template.id}/activate`);
      expect(activated.body.isActive).toBe(true);

      const deleted = await api(token).delete(`/api/class-templates/${template.id}`);
      expect(deleted.status).toBe(204);
      const list = await api(token).get("/api/class-templates");
      expect(list.body).toEqual([]);
    });

    it("continua editável depois que o professor padrão é desativado", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Yoga");
      const instructor = await createStaffUser("aline@fitburn.local", "Aline Souza");
      const created = await api(token).post("/api/class-templates").send({
        name: "Yoga suave",
        durationMinutes: 60,
        capacity: 12,
        modalityId: modality.id,
        defaultInstructorId: instructor.id,
      });
      await testPrisma.user.update({ where: { id: instructor.id }, data: { status: "INACTIVE" } });

      const edited = await api(token)
        .patch(`/api/class-templates/${created.body.id}`)
        .send({ capacity: 14, defaultInstructorId: instructor.id });

      expect(edited.status).toBe(200);
      expect(edited.body.capacity).toBe(14);
    });

    it("lista como professores só os usuários de equipe ativos", async () => {
      const { token } = await loginAsAdmin();
      await createStaffUser("camila@fitburn.local", "Camila Rocha");
      await createStaffUser("diego@fitburn.local", "Diego Lima", "INACTIVE");
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      await createUser({
        email: "cliente@fitburn.local",
        password: PASSWORD,
        profileId: clientProfile.id,
        fullName: "Maria Cliente",
      });

      const response = await api(token).get("/api/class-templates/instructors");

      expect(response.status).toBe(200);
      const names = response.body.map((i: { fullName: string }) => i.fullName);
      expect(names).toContain("Camila Rocha");
      expect(names).not.toContain("Diego Lima");
      expect(names).not.toContain("Maria Cliente");
    });
  });

  describe("Exclusão de modalidade", () => {
    it("exclui uma modalidade sem templates", async () => {
      const { token } = await loginAsAdmin();
      const modality = await createModality(token, "Pilates");

      const response = await api(token).delete(`/api/modalities/${modality.id}`);

      expect(response.status).toBe(204);
      const list = await api(token).get("/api/modalities");
      expect(list.body).toEqual([]);
    });

    it("recusa excluir modalidade usada por algum template, mesmo inativo", async () => {
      const { token } = await loginAsAdmin();
      const template = await createTemplate(token);
      await api(token).post(`/api/class-templates/${template.id}/deactivate`);

      const response = await api(token).delete(`/api/modalities/${template.modality.id}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("MODALITY_IN_USE");
      const list = await api(token).get("/api/modalities");
      expect(list.body[0]).toMatchObject({ templateCount: 1, activeTemplateCount: 0 });
    });
  });

  describe("Permissões", () => {
    async function loginWithCatalogAccess(actions: Array<"VIEW" | "CREATE" | "EDIT" | "DELETE">) {
      const profile = await createAccessProfile({ name: "Recepção" });
      if (actions.length > 0) {
        await grantModuleAccess({
          profileId: profile.id,
          module: "TEMPLATES_DE_AULA",
          actions,
          scope: "ALL",
        });
      }
      const user = await createUser({
        email: "recepcao@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
      });
      return loginAndGetAccessToken(app, user.email, PASSWORD);
    }

    it("perfil sem o módulo 'templates de aula' recebe 403", async () => {
      const token = await loginWithCatalogAccess([]);

      const modalities = await api(token).get("/api/modalities");
      const templates = await api(token).get("/api/class-templates");

      expect(modalities.status).toBe(403);
      expect(templates.status).toBe(403);
    });

    it("perfil só com visualização lista, mas não cria nem exclui", async () => {
      const token = await loginWithCatalogAccess(["VIEW"]);

      const list = await api(token).get("/api/modalities");
      const create = await api(token).post("/api/modalities").send({ name: "Pilates" });

      expect(list.status).toBe(200);
      expect(create.status).toBe(403);
      expect(create.body.code).toBe("FORBIDDEN");
    });

    it("editar e excluir exigem as ações EDIT e DELETE", async () => {
      const { token: adminToken } = await loginAsAdmin();
      const template = await createTemplate(adminToken);
      const token = await loginWithCatalogAccess(["VIEW", "CREATE"]);

      const edit = await api(token)
        .patch(`/api/class-templates/${template.id}`)
        .send({ capacity: 5 });
      const deactivate = await api(token).post(`/api/class-templates/${template.id}/deactivate`);
      const remove = await api(token).delete(`/api/class-templates/${template.id}`);
      const removeModality = await api(token).delete(`/api/modalities/${template.modality.id}`);

      expect([edit.status, deactivate.status, remove.status, removeModality.status]).toEqual([
        403, 403, 403, 403,
      ]);
    });
  });

  async function createStaffUser(
    email: string,
    fullName: string,
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) {
    const profile =
      (await testPrisma.accessProfile.findUnique({ where: { name: "Professor" } })) ??
      (await createAccessProfile({ name: "Professor" }));
    return createUser({ email, password: PASSWORD, profileId: profile.id, fullName, status });
  }

  async function createTemplate(token: string) {
    const modality = await createModality(token, "Treino Funcional");
    const response = await api(token)
      .post("/api/class-templates")
      .send({
        name: "Treino Funcional",
        durationMinutes: 45,
        capacity: 12,
        modalityId: modality.id,
      });
    expect(response.status).toBe(201);
    return response.body as { id: string; modality: { id: string } };
  }

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

  async function createModality(token: string, name: string) {
    const response = await api(token).post("/api/modalities").send({ name });
    expect(response.status).toBe(201);
    return response.body as { id: string; name: string };
  }
});
