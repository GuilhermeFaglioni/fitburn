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

    it("edita os dados de um membro da equipe e persiste (e-mail, telefone, documento, endereço)", async () => {
      const { token } = await loginAsAdmin();
      const staffProfile = await createAccessProfile({ name: "Recepção" });
      const target = await createUser({ email: "equipe@fitburn.local", password: PASSWORD, profileId: staffProfile.id });

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${target.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "equipe.nova@fitburn.local",
          phone: "31988887777",
          document: "98765432100",
          address: "Rua Dois, 456",
        });

      expect(response.status).toBe(200);
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(stored).toMatchObject({
        email: "equipe.nova@fitburn.local",
        phone: "31988887777",
        document: "98765432100",
        address: "Rua Dois, 456",
      });
    });

    it("recusa e-mail já em uso por outro usuário com EMAIL_ALREADY_IN_USE e não altera nada", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      await createUser({ email: "ocupado@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      const target = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: clientProfile.id });

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${target.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Novo Nome", email: "ocupado@fitburn.local" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("EMAIL_ALREADY_IN_USE");
      // Nada mudou: a linha inteira (nome, e-mail, perfil, senha, updatedAt...) é idêntica à criada pelo factory.
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(stored).toEqual(target);
      expect(stored.fullName).toBe("Usuário de Teste");
    });

    it("recusa perfil inexistente, usuário inexistente e corpo inválido", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const target = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      const patch = (id: string, body: object) =>
        request(app.getHttpServer())
          .patch(`/api/users/${id}`)
          .set("Authorization", `Bearer ${token}`)
          .send(body);

      const unknownProfile = await patch(target.id, { profileId: "00000000-0000-4000-8000-000000000000" });
      const unknownUser = await patch("00000000-0000-4000-8000-000000000000", { fullName: "Fulano" });
      const invalidEmail = await patch(target.id, { email: "isso-nao-e-email" });

      expect(unknownProfile.status).toBe(400);
      expect(unknownProfile.body.code).toBe("PROFILE_NOT_FOUND");
      expect(unknownUser.status).toBe(404);
      expect(invalidEmail.status).toBe(400);
      expect(invalidEmail.body.code).toBe("VALIDATION_ERROR");
    });

    it("exige a ação de editar no módulo Usuários: só visualizar recebe 403 e não altera; sem sessão é 401", async () => {
      const viewerProfile = await createAccessProfile({ name: "Leitor" });
      await grantModuleAccess({ profileId: viewerProfile.id, module: "USUARIOS", actions: ["VIEW"], scope: "ALL" });
      const viewer = await createUser({ email: "leitor@fitburn.local", password: PASSWORD, profileId: viewerProfile.id });
      const target = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: viewerProfile.id });
      const token = await loginAndGetAccessToken(app, viewer.email, PASSWORD);

      const forbidden = await request(app.getHttpServer())
        .patch(`/api/users/${target.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Alterado" });
      const anonymous = await request(app.getHttpServer())
        .patch(`/api/users/${target.id}`)
        .send({ fullName: "Alterado" });

      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe("FORBIDDEN");
      expect(anonymous.status).toBe(401);
      // Nada mudou: a linha inteira é idêntica à criada pelo factory.
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(stored).toEqual(target);
      expect(stored.fullName).toBe("Usuário de Teste");
    });
  });

  // Achado A1 da auditoria (docs/test-matrix.md): as rotas de escrita de Usuários só checam a ação
  // (EDIT/DELETE) e ignoram o escopo OWN, que GET /api/users e GET /api/users/:id respeitam. Os
  // testes `it.fails` descrevem o comportamento CORRETO e falham hoje, de propósito: enquanto o bug
  // existir a suíte fica verde; quando ele for corrigido o `it.fails` passa a FALHAR, e aí basta
  // trocar `it.fails` por `it`.
  describe("Escopo OWN nas rotas de escrita (achado A1: bug conhecido)", () => {
    async function seedOwnScopeActor() {
      const ownProfile = await createAccessProfile({ name: "Só os próprios" });
      await grantModuleAccess({
        profileId: ownProfile.id,
        module: "USUARIOS",
        actions: ["VIEW", "EDIT", "DELETE"],
        scope: "OWN",
      });
      const actor = await createUser({ email: "proprio@fitburn.local", password: PASSWORD, profileId: ownProfile.id });
      const other = await createUser({ email: "outro@fitburn.local", password: PASSWORD, profileId: ownProfile.id });
      const token = await loginAndGetAccessToken(app, actor.email, PASSWORD);
      return { actor, other, token };
    }

    it("o perfil com escopo OWN não vê outro usuário, mas edita a si mesmo (a base dos testes abaixo)", async () => {
      const { actor, other, token } = await seedOwnScopeActor();

      const readOther = await request(app.getHttpServer())
        .get(`/api/users/${other.id}`)
        .set("Authorization", `Bearer ${token}`);
      const editSelf = await request(app.getHttpServer())
        .patch(`/api/users/${actor.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Eu Mesmo" });

      expect(readOther.status).toBe(403);
      expect(readOther.body.code).toBe("OUT_OF_SCOPE");
      expect(editSelf.status).toBe(200);
    });

    it.fails("EDIT com escopo OWN não edita outro usuário: 403 OUT_OF_SCOPE e nada muda", async () => {
      const { other, token } = await seedOwnScopeActor();

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${other.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Invadido" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
      expect(await testPrisma.user.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other);
    });

    it.fails("EDIT com escopo OWN não desativa outro usuário: 403 OUT_OF_SCOPE e ele continua ATIVO", async () => {
      const { other, token } = await seedOwnScopeActor();

      const response = await request(app.getHttpServer())
        .post(`/api/users/${other.id}/deactivate`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
      expect(await testPrisma.user.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other);
    });

    it.fails("DELETE com escopo OWN não anonimiza outro usuário: 403 OUT_OF_SCOPE e os dados ficam intactos", async () => {
      const { other, token } = await seedOwnScopeActor();

      const response = await request(app.getHttpServer())
        .delete(`/api/users/${other.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
      expect(await testPrisma.user.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other);
    });
  });

  describe("Requisições simultâneas com o mesmo e-mail ou documento", () => {
    const codes = (responses: Array<{ status: number; body: { code?: string } }>) =>
      responses.map((r) => `${r.status}${r.body.code ? ` ${r.body.code}` : ""}`).sort();

    it("dois cadastros de cliente com o mesmo e-mail: um cria, o outro recebe EMAIL_ALREADY_IN_USE (nunca 500)", async () => {
      const { token } = await loginAsAdmin();
      await createAccessProfile({ name: "Cliente", isSystem: true });
      const send = (document: string) =>
        request(app.getHttpServer())
          .post("/api/users/clients")
          .set("Authorization", `Bearer ${token}`)
          .send({ ...validClientBody, document });

      const responses = await Promise.all([send("11111111111"), send("22222222222")]);

      expect(codes(responses)).toEqual(["201", "409 EMAIL_ALREADY_IN_USE"]);
    });

    it("dois cadastros de cliente com o mesmo documento: um cria, o outro recebe DOCUMENT_ALREADY_IN_USE", async () => {
      const { token } = await loginAsAdmin();
      await createAccessProfile({ name: "Cliente", isSystem: true });
      const send = (email: string) =>
        request(app.getHttpServer())
          .post("/api/users/clients")
          .set("Authorization", `Bearer ${token}`)
          .send({ ...validClientBody, email });

      const responses = await Promise.all([send("a@fitburn.local"), send("b@fitburn.local")]);

      expect(codes(responses)).toEqual(["201", "409 DOCUMENT_ALREADY_IN_USE"]);
    });

    it("dois cadastros de equipe com o mesmo e-mail: um cria, o outro recebe EMAIL_ALREADY_IN_USE", async () => {
      const { token } = await loginAsAdmin();
      const staffProfile = await createAccessProfile({ name: "Recepção" });
      const send = () =>
        request(app.getHttpServer())
          .post("/api/users/staff")
          .set("Authorization", `Bearer ${token}`)
          .send({
            fullName: "Recepcionista",
            email: "recepcao@fitburn.local",
            password: PASSWORD,
            profileId: staffProfile.id,
          });

      const responses = await Promise.all([send(), send()]);

      expect(codes(responses)).toEqual(["201", "409 EMAIL_ALREADY_IN_USE"]);
    });

    it("duas edições que levam ao mesmo e-mail ou documento: uma vale, a outra recebe 409", async () => {
      const { token } = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const ana = await createUser({ email: "ana@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      const bruno = await createUser({ email: "bruno@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
      const patch = (id: string, body: object) =>
        request(app.getHttpServer())
          .patch(`/api/users/${id}`)
          .set("Authorization", `Bearer ${token}`)
          .send(body);

      const sameEmail = await Promise.all([
        patch(ana.id, { email: "novo@fitburn.local" }),
        patch(bruno.id, { email: "novo@fitburn.local" }),
      ]);
      const sameDocument = await Promise.all([
        patch(ana.id, { document: "99999999999" }),
        patch(bruno.id, { document: "99999999999" }),
      ]);

      expect(codes(sameEmail)).toEqual(["200", "409 EMAIL_ALREADY_IN_USE"]);
      expect(codes(sameDocument)).toEqual(["200", "409 DOCUMENT_ALREADY_IN_USE"]);
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
