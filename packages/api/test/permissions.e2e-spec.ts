import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Motor de autorização (HTTP)", () => {
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

  it("perfil sem nenhuma permissão no módulo recebe 403 FORBIDDEN", async () => {
    const profile = await createAccessProfile({ name: "Professor" });
    const user = await createUser({ email: "professor@fitburn.local", password: PASSWORD, profileId: profile.id });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`/api/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("cliente (escopo OWN) acessando outro usuário recebe 403 OUT_OF_SCOPE", async () => {
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    await grantModuleAccess({
      profileId: clientProfile.id,
      module: "USUARIOS",
      actions: ["VIEW"],
      scope: "OWN",
    });
    const me = await createUser({ email: "cliente1@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
    const outroCliente = await createUser({
      email: "cliente2@fitburn.local",
      password: PASSWORD,
      profileId: clientProfile.id,
    });
    const token = await loginAndGetAccessToken(app, me.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`/api/users/${outroCliente.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("OUT_OF_SCOPE");
  });

  it("cliente (escopo OWN) acessando os próprios dados recebe 200", async () => {
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    await grantModuleAccess({
      profileId: clientProfile.id,
      module: "USUARIOS",
      actions: ["VIEW"],
      scope: "OWN",
    });
    const me = await createUser({ email: "cliente@fitburn.local", password: PASSWORD, profileId: clientProfile.id });
    const token = await loginAndGetAccessToken(app, me.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(me.id);
  });

  it("administrador (sem linhas na tabela) acessa qualquer usuário", async () => {
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const admin = await createUser({ email: "admin@fitburn.local", password: PASSWORD, profileId: adminProfile.id });
    const cliente = await createUser({
      email: "cliente@fitburn.local",
      password: PASSWORD,
      profileId: clientProfile.id,
    });
    const token = await loginAndGetAccessToken(app, admin.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`/api/users/${cliente.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(cliente.id);
  });

  it("uma mudança de permissão vale já na próxima requisição, sem cache", async () => {
    const profile = await createAccessProfile({ name: "Funcionário" });
    const alvo = await createUser({ email: "alvo@fitburn.local", password: PASSWORD, profileId: profile.id });
    const user = await createUser({ email: "funcionario@fitburn.local", password: PASSWORD, profileId: profile.id });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

    const antes = await request(app.getHttpServer())
      .get(`/api/users/${alvo.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(antes.status).toBe(403);

    await grantModuleAccess({
      profileId: profile.id,
      module: "USUARIOS",
      actions: ["VIEW"],
      scope: "ALL",
    });

    const depoisDeConceder = await request(app.getHttpServer())
      .get(`/api/users/${alvo.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(depoisDeConceder.status).toBe(200);

    await grantModuleAccess({
      profileId: profile.id,
      module: "USUARIOS",
      actions: [],
      scope: "ALL",
    });

    const depoisDeRevogar = await request(app.getHttpServer())
      .get(`/api/users/${alvo.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(depoisDeRevogar.status).toBe(403);
  });

  it("GET /api/auth/me inclui as permissões efetivas do perfil", async () => {
    const profile = await createAccessProfile({ name: "Recepção" });
    await grantModuleAccess({
      profileId: profile.id,
      module: "CLIENTES",
      actions: ["VIEW", "CREATE"],
      scope: "ALL",
    });
    const user = await createUser({ email: "recepcao@fitburn.local", password: PASSWORD, profileId: profile.id });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.permissions).toEqual([
      { module: "CLIENTES", actions: ["VIEW", "CREATE"], scope: "ALL" },
    ]);
  });

  it("GET /api/auth/me para o administrador sintetiza acesso total a todos os módulos", async () => {
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const admin = await createUser({ email: "admin@fitburn.local", password: PASSWORD, profileId: adminProfile.id });
    const token = await loginAndGetAccessToken(app, admin.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.permissions.length).toBeGreaterThanOrEqual(11);
    expect(response.body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: "USUARIOS", scope: "ALL" }),
      ]),
    );
  });
});
