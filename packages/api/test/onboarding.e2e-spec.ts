import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const NEW_PASSWORD = "SenhaNova456!";

function refreshCookie(response: request.Response): string | undefined {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie: string) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

describe("Gate de onboarding (HTTP)", () => {
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

  async function createPasswordChangeSession() {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({
      email: "marina@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    await testPrisma.$executeRaw`UPDATE "users" SET "mustChangePassword" = true WHERE id = ${user.id}`;
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });
    return { user, login, accessToken: login.body.accessToken as string };
  }

  it("expõe a pendência e mantém abertas as rotas de sessão e de leitura do próprio usuário", async () => {
    const { login, accessToken } = await createPasswordChangeSession();
    expect(login.status).toBe(201);
    expect(login.body.user.onboardingPending).toEqual(["PASSWORD_CHANGE"]);

    const profile = await request(app.getHttpServer())
      .get("/api/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.onboardingPending).toEqual(["PASSWORD_CHANGE"]);

    const authMe = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(authMe.status).toBe(200);
    expect(authMe.body.onboardingPending).toEqual(["PASSWORD_CHANGE"]);

    const cookie = refreshCookie(login);
    expect(cookie).toBeDefined();
    const refresh = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", cookie!);
    expect(refresh.status).toBe(200);
    expect(refresh.body.user.onboardingPending).toEqual(["PASSWORD_CHANGE"]);

    const logout = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Cookie", refreshCookie(refresh)!);
    expect(logout.status).toBe(204);
  });

  it("recusa rotas de domínio e edição do perfil até concluir a troca de senha", async () => {
    const { accessToken } = await createPasswordChangeSession();

    const domain = await request(app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(domain.status).toBe(403);
    expect(domain.body.code).toBe("ONBOARDING_REQUIRED");
    expect(domain.body.details.pending).toEqual(["PASSWORD_CHANGE"]);

    const updateProfile = await request(app.getHttpServer())
      .patch("/api/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ fullName: "Nome novo" });
    expect(updateProfile.status).toBe(403);
    expect(updateProfile.body.code).toBe("ONBOARDING_REQUIRED");
  });

  it("libera as rotas de domínio depois da troca obrigatória", async () => {
    const { user, accessToken } = await createPasswordChangeSession();

    const changed = await request(app.getHttpServer())
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    expect(changed.body.user.onboardingPending).toEqual([]);

    const currentProfile = await request(app.getHttpServer())
      .get("/api/me")
      .set("Authorization", `Bearer ${changed.body.accessToken as string}`);
    expect(currentProfile.body.onboardingPending).toEqual([]);

    const oldToken = await request(app.getHttpServer())
      .get("/api/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(oldToken.status).toBe(401);

    const domain = await request(app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${changed.body.accessToken as string}`);
    expect(domain.body.code).toBe("FORBIDDEN");

    const savedUser = await testPrisma.$queryRaw<Array<{ mustChangePassword: boolean }>>`
      SELECT "mustChangePassword" FROM "users" WHERE id = ${user.id}
    `;
    expect(savedUser).toEqual([{ mustChangePassword: false }]);
  });

  it("marca clientes e equipe no cadastro e volta a marcar no reset administrativo", async () => {
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const admin = await createUser({
      email: "admin@fitburn.local",
      password: PASSWORD,
      profileId: adminProfile.id,
    });
    const adminLogin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: admin.email, password: PASSWORD });
    const adminToken = adminLogin.body.accessToken as string;
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const staffProfile = await createAccessProfile({ name: "Professor" });

    const client = await request(app.getHttpServer())
      .post("/api/users/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        fullName: "Marina Souza",
        email: "nova-cliente@fitburn.local",
        phone: "31998765432",
        birthDate: "1994-03-14",
        document: "12345678900",
        address: "Rua das Palmeiras, 220",
        password: PASSWORD,
      });
    expect(client.status).toBe(201);
    expect(client.body.onboardingPending).toEqual(["PASSWORD_CHANGE"]);

    const staff = await request(app.getHttpServer())
      .post("/api/users/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        fullName: "Rafael Prado",
        email: "novo-professor@fitburn.local",
        password: PASSWORD,
        profileId: staffProfile.id,
      });
    expect(staff.status).toBe(201);
    expect(staff.body.onboardingPending).toEqual(["PASSWORD_CHANGE"]);

    const target = await createUser({
      email: "alvo@fitburn.local",
      password: PASSWORD,
      profileId: clientProfile.id,
    });
    const reset = await request(app.getHttpServer())
      .post(`/api/users/${target.id}/reset-password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(204);

    const targetLogin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: target.email, password: NEW_PASSWORD });
    expect(targetLogin.status).toBe(201);
    expect(targetLogin.body.user.onboardingPending).toEqual(["PASSWORD_CHANGE"]);
  });
});
