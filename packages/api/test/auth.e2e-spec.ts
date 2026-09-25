import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";

describe("Auth (HTTP)", () => {
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

  async function seedUser(overrides: { status?: "ACTIVE" | "INACTIVE" } = {}) {
    const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
    return createUser({
      email: "admin@fitburn.local",
      password: "SenhaForte123!",
      fullName: "Administradora Fitburn",
      profileId: profile.id,
      status: overrides.status,
    });
  }

  function extractRefreshCookie(response: request.Response): string | undefined {
    const raw = response.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return cookies.find((c: string) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  }

  describe("POST /api/auth/login", () => {
    it("com credenciais corretas retorna o access token, os dados do usuário e o cookie de refresh", async () => {
      await seedUser();

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@fitburn.local", password: "SenhaForte123!" });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        user: {
          email: "admin@fitburn.local",
          fullName: "Administradora Fitburn",
          status: "ACTIVE",
          profile: { name: "Administrador" },
        },
      });

      const refreshCookie = extractRefreshCookie(response);
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("SameSite=Lax");
      expect(refreshCookie).toContain("Path=/api/auth");

      const tokensInDb = await testPrisma.refreshToken.count();
      expect(tokensInDb).toBe(1);
    });

    it("com senha errada recusa com INVALID_CREDENTIALS genérico", async () => {
      await seedUser();

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@fitburn.local", password: "senha-errada" });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("INVALID_CREDENTIALS");
    });

    it("com e-mail desconhecido recusa com o mesmo INVALID_CREDENTIALS genérico", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "ninguem@fitburn.local", password: "qualquer-coisa" });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("INVALID_CREDENTIALS");
    });

    it("recusa um usuário inativo com USER_INACTIVE", async () => {
      await seedUser({ status: "INACTIVE" });

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@fitburn.local", password: "SenhaForte123!" });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("USER_INACTIVE");
    });

    it("recusa um corpo inválido com VALIDATION_ERROR", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "não-é-email", password: "" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/auth/me", () => {
    it("sem token retorna 401 UNAUTHENTICATED", async () => {
      const response = await request(app.getHttpServer()).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHENTICATED");
    });

    it("com um access token válido retorna os dados do usuário atual", async () => {
      await seedUser();
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@fitburn.local", password: "SenhaForte123!" });

      const response = await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${login.body.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email: "admin@fitburn.local",
        profile: { name: "Administrador" },
      });
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revoga a sessão referente ao cookie de refresh e limpa o cookie", async () => {
      await seedUser();
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@fitburn.local", password: "SenhaForte123!" });
      const refreshCookie = extractRefreshCookie(login);

      const response = await request(app.getHttpServer())
        .post("/api/auth/logout")
        .set("Cookie", refreshCookie ?? "");

      expect(response.status).toBe(204);

      const token = await testPrisma.refreshToken.findFirst();
      expect(token?.revokedAt).not.toBeNull();
    });
  });
});
