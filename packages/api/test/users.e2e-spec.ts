import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Gestão de usuários (HTTP)", () => {
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

  const validClientBody = {
    fullName: "Cliente Teste",
    email: "cliente@fitburn.local",
    phone: "31999990000",
    birthDate: "1990-05-20",
    document: "12345678900",
    address: "Rua Um, 123",
    password: PASSWORD,
  };

  describe("POST /api/users/clients", () => {
    it("cria um cliente com o perfil de sistema Cliente atribuído automaticamente", async () => {
      const { token } = await loginAsAdmin();
      await createAccessProfile({ name: "Cliente", isSystem: true });

      const response = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send(validClientBody);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        email: validClientBody.email,
        fullName: validClientBody.fullName,
        phone: validClientBody.phone,
        document: validClientBody.document,
        address: validClientBody.address,
        status: "ACTIVE",
        profile: { name: "Cliente" },
      });
      expect(response.body.birthDate).toBe("1990-05-20");
    });

    it("recusa e-mail já em uso com EMAIL_ALREADY_IN_USE", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      await createUser({ email: validClientBody.email, password: PASSWORD, profileId: clientProfile.id });

      const response = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validClientBody, document: "00000000000" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("EMAIL_ALREADY_IN_USE");
    });

    it("recusa documento já em uso com DOCUMENT_ALREADY_IN_USE", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      await createUser({
        email: "outro@fitburn.local",
        password: PASSWORD,
        profileId: clientProfile.id,
        document: validClientBody.document,
      });

      const response = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send(validClientBody);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("DOCUMENT_ALREADY_IN_USE");
    });

    it("recusa corpo inválido (campo obrigatório ausente) com VALIDATION_ERROR", async () => {
      const { token } = await loginAsAdmin();
      await createAccessProfile({ name: "Cliente", isSystem: true });
      const { phone: _phone, ...withoutPhone } = validClientBody;

      const response = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send(withoutPhone);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("sem permissão de criar no módulo Usuários recebe 403 FORBIDDEN", async () => {
      const profile = await createAccessProfile({ name: "Recepção" });
      const user = await createUser({ email: "recepcao@fitburn.local", password: PASSWORD, profileId: profile.id });
      const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
      await createAccessProfile({ name: "Cliente", isSystem: true });

      const response = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send(validClientBody);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    });
  });

  describe("POST /api/users/staff", () => {
    it("cria um membro da equipe com o perfil escolhido", async () => {
      const { token } = await loginAsAdmin();
      const staffProfile = await createAccessProfile({ name: "Recepção" });

      const response = await request(app.getHttpServer())
        .post("/api/users/staff")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Recepcionista",
          email: "recepcao@fitburn.local",
          password: PASSWORD,
          profileId: staffProfile.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.profile).toMatchObject({ id: staffProfile.id, name: "Recepção" });
    });

    it("recusa um profileId inexistente", async () => {
      const { token } = await loginAsAdmin();

      const response = await request(app.getHttpServer())
        .post("/api/users/staff")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Fulano",
          email: "fulano@fitburn.local",
          password: PASSWORD,
          profileId: "00000000-0000-0000-0000-000000000000",
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("PROFILE_NOT_FOUND");
    });
  });

  describe("GET /api/users", () => {
    it("lista com filtro por perfil e por status", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      await createUser({ email: "ativo@fitburn.local", password: PASSWORD, profileId: clientProfile.id, status: "ACTIVE" });
      await createUser({ email: "inativo@fitburn.local", password: PASSWORD, profileId: clientProfile.id, status: "INACTIVE" });

      const response = await request(app.getHttpServer())
        .get(`/api/users?profileId=${clientProfile.id}&status=ACTIVE`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].email).toBe("ativo@fitburn.local");
    });

    it("um perfil com escopo OWN só vê a si mesmo na listagem", async () => {
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      await grantModuleAccess({ profileId: clientProfile.id, module: "USUARIOS", actions: ["VIEW"], scope: "OWN" });
      const me = await createUser({ email: "eu@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      await createUser({ email: "outro@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      const token = await loginAndGetAccessToken(app, me.email, PASSWORD);

      const response = await request(app.getHttpServer())
        .get("/api/users")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(me.id);
    });
  });

  describe("PATCH /api/users/:id", () => {
    it("edita dados e troca o perfil", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const staffProfile = await createAccessProfile({ name: "Recepção" });
      const target = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: clientProfile.id });

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${target.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Nome Atualizado", profileId: staffProfile.id });

      expect(response.status).toBe(200);
      expect(response.body.fullName).toBe("Nome Atualizado");
      expect(response.body.profile.name).toBe("Recepção");
    });
  });

  describe("Desativação e reativação", () => {
    it("desativar encerra todas as sessões ativas", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const target = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      await loginAndGetAccessToken(app, target.email, PASSWORD);
      await loginAndGetAccessToken(app, target.email, PASSWORD);

      const response = await request(app.getHttpServer())
        .post(`/api/users/${target.id}/deactivate`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("INACTIVE");

      const activeSessions = await testPrisma.refreshToken.count({
        where: { userId: target.id, revokedAt: null },
      });
      expect(activeSessions).toBe(0);

      const loginAttempt = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: target.email, password: PASSWORD });
      expect(loginAttempt.status).toBe(401);
      expect(loginAttempt.body.code).toBe("USER_INACTIVE");
    });

    it("reativar restaura o acesso", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const target = await createUser({
        email: "alvo@fitburn.local",
        password: PASSWORD,
        profileId: clientProfile.id,
        status: "INACTIVE",
      });

      const response = await request(app.getHttpServer())
        .post(`/api/users/${target.id}/reactivate`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("ACTIVE");

      const loginAttempt = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: target.email, password: PASSWORD });
      expect(loginAttempt.status).toBe(201);
    });
  });

  describe("POST /api/users/:id/reset-password", () => {
    it("permite login com a nova senha e recusa a antiga", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const target = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: clientProfile.id });

      const response = await request(app.getHttpServer())
        .post(`/api/users/${target.id}/reset-password`)
        .set("Authorization", `Bearer ${token}`)
        .send({ newPassword: "NovaSenhaForte456!" });

      expect(response.status).toBe(204);

      const withOldPassword = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: target.email, password: PASSWORD });
      expect(withOldPassword.status).toBe(401);

      const withNewPassword = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: target.email, password: "NovaSenhaForte456!" });
      expect(withNewPassword.status).toBe(201);
    });
  });
});
