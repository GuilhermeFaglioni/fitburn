import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Perfis de acesso (HTTP)", () => {
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
    const user = await createUser({ email: "admin@fitburn.local", password: PASSWORD, profileId: profile.id });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { profile, user, token };
  }

  describe("GET /api/profiles/catalog", () => {
    it("retorna o catálogo fixo de módulos, ações e escopos", async () => {
      const { token } = await loginAsAdmin();

      const response = await request(app.getHttpServer())
        .get("/api/profiles/catalog")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.modules).toContain("USUARIOS");
      expect(response.body.actions).toEqual(["VIEW", "CREATE", "EDIT", "DELETE", "EXECUTE"]);
      expect(response.body.scopes).toEqual(["ALL", "ASSIGNED_CLIENTS", "ASSIGNED_CLASSES", "OWN"]);
    });
  });

  describe("CRUD de perfis", () => {
    it("cria um perfil com nome e descrição", async () => {
      const { token } = await loginAsAdmin();

      const response = await request(app.getHttpServer())
        .post("/api/profiles")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Recepção", description: "Equipe da recepção" });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: "Recepção",
        description: "Equipe da recepção",
        isSystem: false,
        isActive: true,
        moduleAccess: [],
      });
    });

    it("recusa nome duplicado", async () => {
      const { token } = await loginAsAdmin();
      await createAccessProfile({ name: "Recepção" });

      const response = await request(app.getHttpServer())
        .post("/api/profiles")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Recepção" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("edita nome e descrição", async () => {
      const { token } = await loginAsAdmin();
      const profile = await createAccessProfile({ name: "Recepção" });

      const response = await request(app.getHttpServer())
        .patch(`/api/profiles/${profile.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "Nova descrição" });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe("Nova descrição");
    });

    it("ativa e desativa um perfil não-sistema", async () => {
      const { token } = await loginAsAdmin();
      const profile = await createAccessProfile({ name: "Recepção" });

      const deactivated = await request(app.getHttpServer())
        .post(`/api/profiles/${profile.id}/deactivate`)
        .set("Authorization", `Bearer ${token}`);
      expect(deactivated.status).toBe(201);
      expect(deactivated.body.isActive).toBe(false);

      const activated = await request(app.getHttpServer())
        .post(`/api/profiles/${profile.id}/activate`)
        .set("Authorization", `Bearer ${token}`);
      expect(activated.status).toBe(201);
      expect(activated.body.isActive).toBe(true);
    });
  });

  describe("Exclusão", () => {
    it("exclui um perfil sem usuários vinculados", async () => {
      const { token } = await loginAsAdmin();
      const profile = await createAccessProfile({ name: "Recepção" });

      const response = await request(app.getHttpServer())
        .delete(`/api/profiles/${profile.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(204);
      const stillExists = await testPrisma.accessProfile.findUnique({ where: { id: profile.id } });
      expect(stillExists).toBeNull();
    });

    it("recusa excluir um perfil com usuários vinculados (PROFILE_IN_USE)", async () => {
      const { token } = await loginAsAdmin();
      const profile = await createAccessProfile({ name: "Recepção" });
      await createUser({ email: "recepcao@fitburn.local", password: PASSWORD, profileId: profile.id });

      const response = await request(app.getHttpServer())
        .delete(`/api/profiles/${profile.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("PROFILE_IN_USE");
    });

    it("recusa excluir um perfil de sistema (SYSTEM_PROFILE_IMMUTABLE)", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });

      const response = await request(app.getHttpServer())
        .delete(`/api/profiles/${clientProfile.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("SYSTEM_PROFILE_IMMUTABLE");
    });
  });

  describe("Regras dos perfis de sistema", () => {
    it("recusa desativar o Administrador", async () => {
      const { token, profile } = await loginAsAdmin();

      const response = await request(app.getHttpServer())
        .post(`/api/profiles/${profile.id}/deactivate`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("SYSTEM_PROFILE_IMMUTABLE");
    });

    it("recusa desativar o Cliente", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });

      const response = await request(app.getHttpServer())
        .post(`/api/profiles/${clientProfile.id}/deactivate`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("SYSTEM_PROFILE_IMMUTABLE");
    });

    it("recusa editar a matriz de permissões do Administrador", async () => {
      const { token, profile } = await loginAsAdmin();

      const response = await request(app.getHttpServer())
        .put(`/api/profiles/${profile.id}/module-access/CLIENTES`)
        .set("Authorization", `Bearer ${token}`)
        .send({ actions: ["VIEW"], scope: "ALL" });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("SYSTEM_PROFILE_IMMUTABLE");
    });

    it("recusa dar ao Cliente um escopo diferente de OWN", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });

      const response = await request(app.getHttpServer())
        .put(`/api/profiles/${clientProfile.id}/module-access/RESERVAS`)
        .set("Authorization", `Bearer ${token}`)
        .send({ actions: ["VIEW"], scope: "ALL" });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("SYSTEM_PROFILE_IMMUTABLE");
    });

    it("permite conceder ao Cliente uma permissão com escopo OWN", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });

      const response = await request(app.getHttpServer())
        .put(`/api/profiles/${clientProfile.id}/module-access/RESERVAS`)
        .set("Authorization", `Bearer ${token}`)
        .send({ actions: ["VIEW"], scope: "OWN" });

      expect(response.status).toBe(200);
      expect(response.body.moduleAccess).toContainEqual({
        module: "RESERVAS",
        actions: ["VIEW"],
        scope: "OWN",
      });
    });

    it("mantém imutáveis nomes de perfis de sistema, mas permite editar descrições", async () => {
      const { token, profile: adminProfile } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });

      for (const [profile, newName] of [
        [adminProfile, "Administrador renomeado"],
        [clientProfile, "Cliente renomeado"],
      ] as const) {
        const renamed = await request(app.getHttpServer())
          .patch(`/api/profiles/${profile.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ name: newName });

        expect(renamed.status).toBe(422);
        expect(renamed.body.code).toBe("SYSTEM_PROFILE_IMMUTABLE");
        expect((await testPrisma.accessProfile.findUniqueOrThrow({ where: { id: profile.id } })).name).toBe(
          profile.name,
        );

        const description = await request(app.getHttpServer())
          .patch(`/api/profiles/${profile.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ description: `Descrição de ${profile.name}` });

        expect(description.status).toBe(200);
        expect(description.body).toMatchObject({ name: profile.name, description: `Descrição de ${profile.name}` });
      }
    });
  });

  describe("Teto de privilégio na matriz", () => {
    it("recusa editar a própria matriz e conceder ação que o ator não possui; aceita subconjunto", async () => {
      const actorProfile = await createAccessProfile({ name: "Gestor de perfis" });
      await grantModuleAccess({
        profileId: actorProfile.id,
        module: "PERFIS_DE_ACESSO",
        actions: ["EDIT"],
        scope: "ALL",
      });
      await grantModuleAccess({
        profileId: actorProfile.id,
        module: "CLIENTES",
        actions: ["VIEW"],
        scope: "OWN",
      });
      const actor = await createUser({
        email: "gestor-perfis@fitburn.local",
        password: PASSWORD,
        profileId: actorProfile.id,
      });
      const token = await loginAndGetAccessToken(app, actor.email, PASSWORD);
      const targetProfile = await createAccessProfile({ name: "Perfil alvo" });
      const setAccess = (profileId: string, actions: string[], scope: string) =>
        request(app.getHttpServer())
          .put(`/api/profiles/${profileId}/module-access/CLIENTES`)
          .set("Authorization", `Bearer ${token}`)
          .send({ actions, scope });

      const selfMatrix = await setAccess(actorProfile.id, ["VIEW"], "OWN");
      const excessiveAction = await setAccess(targetProfile.id, ["DELETE"], "OWN");
      const subset = await setAccess(targetProfile.id, ["VIEW"], "OWN");

      expect(selfMatrix.status).toBe(403);
      expect(selfMatrix.body.code).toBe("FORBIDDEN");
      expect(excessiveAction.status).toBe(403);
      expect(excessiveAction.body.code).toBe("FORBIDDEN");
      expect(subset.status).toBe(200);
      expect(subset.body.moduleAccess).toContainEqual({
        module: "CLIENTES",
        actions: ["VIEW"],
        scope: "OWN",
      });
    });

    it("compara escopos pela amplitude efetiva e mantém equivalentes os escopos ASSIGNED", async () => {
      const actorProfile = await createAccessProfile({ name: "Gestor de clientes" });
      await grantModuleAccess({
        profileId: actorProfile.id,
        module: "PERFIS_DE_ACESSO",
        actions: ["EDIT"],
        scope: "ALL",
      });
      await grantModuleAccess({
        profileId: actorProfile.id,
        module: "CLIENTES",
        actions: ["VIEW"],
        scope: "ASSIGNED_CLIENTS",
      });
      const actor = await createUser({
        email: "gestor-clientes@fitburn.local",
        password: PASSWORD,
        profileId: actorProfile.id,
      });
      const token = await loginAndGetAccessToken(app, actor.email, PASSWORD);
      const targetProfile = await createAccessProfile({ name: "Clientes atribuídos" });
      const setScope = (scope: string) =>
        request(app.getHttpServer())
          .put(`/api/profiles/${targetProfile.id}/module-access/CLIENTES`)
          .set("Authorization", `Bearer ${token}`)
          .send({ actions: ["VIEW"], scope });

      const broaderScope = await setScope("ALL");
      const equivalentAssignedScope = await setScope("ASSIGNED_CLASSES");

      expect(broaderScope.status).toBe(403);
      expect(broaderScope.body.code).toBe("FORBIDDEN");
      expect(equivalentAssignedScope.status).toBe(200);
      expect(equivalentAssignedScope.body.moduleAccess).toContainEqual({
        module: "CLIENTES",
        actions: ["VIEW"],
        scope: "ASSIGNED_CLASSES",
      });
    });

    it("o administrador de sistema pode conceder qualquer ação em perfis customizados", async () => {
      const { token } = await loginAsAdmin();
      const targetProfile = await createAccessProfile({ name: "Perfil avançado" });

      const response = await request(app.getHttpServer())
        .put(`/api/profiles/${targetProfile.id}/module-access/CLIENTES`)
        .set("Authorization", `Bearer ${token}`)
        .send({ actions: ["DELETE"], scope: "ALL" });

      expect(response.status).toBe(200);
      expect(response.body.moduleAccess).toContainEqual({
        module: "CLIENTES",
        actions: ["DELETE"],
        scope: "ALL",
      });
    });
  });

  describe("Um perfil customizado concede acesso efetivo (e desativar revoga na hora)", () => {
    it("um perfil customizado com a permissão certa acessa; sem ela, recebe 403", async () => {
      const customProfile = await createAccessProfile({ name: "Recepção" });
      const user = await createUser({
        email: "recepcao@fitburn.local",
        password: PASSWORD,
        profileId: customProfile.id,
      });
      const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

      const before = await request(app.getHttpServer())
        .get("/api/profiles")
        .set("Authorization", `Bearer ${token}`);
      expect(before.status).toBe(403);

      await grantModuleAccess({
        profileId: customProfile.id,
        module: "PERFIS_DE_ACESSO",
        actions: ["VIEW"],
        scope: "ALL",
      });

      const after = await request(app.getHttpServer())
        .get("/api/profiles")
        .set("Authorization", `Bearer ${token}`);
      expect(after.status).toBe(200);
    });

    it("desativar o perfil revoga o acesso na próxima requisição, sem precisar de novo login", async () => {
      const customProfile = await createAccessProfile({ name: "Recepção" });
      await grantModuleAccess({
        profileId: customProfile.id,
        module: "PERFIS_DE_ACESSO",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const user = await createUser({
        email: "recepcao@fitburn.local",
        password: PASSWORD,
        profileId: customProfile.id,
      });
      const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

      const before = await request(app.getHttpServer())
        .get("/api/profiles")
        .set("Authorization", `Bearer ${token}`);
      expect(before.status).toBe(200);

      const { token: adminToken } = await loginAsAdmin();
      await request(app.getHttpServer())
        .post(`/api/profiles/${customProfile.id}/deactivate`)
        .set("Authorization", `Bearer ${adminToken}`);

      const after = await request(app.getHttpServer())
        .get("/api/profiles")
        .set("Authorization", `Bearer ${token}`);
      expect(after.status).toBe(403);
    });
  });
});
