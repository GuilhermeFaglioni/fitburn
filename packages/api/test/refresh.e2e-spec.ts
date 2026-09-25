import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";

const PASSWORD = "SenhaForte123!";

describe("Renovação de sessão (HTTP)", () => {
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

  function extractRefreshCookie(response: request.Response): string | undefined {
    const raw = response.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return cookies.find((c: string) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  }

  async function loginAsNewUser() {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({ email: "cliente@fitburn.local", password: PASSWORD, profileId: profile.id });
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });
    return { user, refreshCookie: extractRefreshCookie(login)! };
  }

  it("rotaciona: emite novo access e refresh token e revoga o anterior", async () => {
    const { refreshCookie } = await loginAsNewUser();

    const response = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    const newRefreshCookie = extractRefreshCookie(response);
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie).not.toBe(refreshCookie);

    const tokens = await testPrisma.refreshToken.findMany({ orderBy: { createdAt: "asc" } });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.revokedAt).not.toBeNull();
    expect(tokens[1]?.revokedAt).toBeNull();
  });

  it("o novo refresh token funciona para uma próxima rotação", async () => {
    const { refreshCookie } = await loginAsNewUser();

    const first = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", refreshCookie);
    const secondCookie = extractRefreshCookie(first)!;

    const second = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", secondCookie);

    expect(second.status).toBe(200);
  });

  it("reusar um refresh token já rotacionado revoga todas as sessões do usuário", async () => {
    const { user, refreshCookie } = await loginAsNewUser();

    const first = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(first.status).toBe(200);

    // Reusa o cookie ORIGINAL, já revogado pela primeira rotação.
    const reuse = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", refreshCookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("SESSION_EXPIRED");

    const activeSessions = await testPrisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(activeSessions).toBe(0);
  });

  it("um refresh token expirado é recusado com SESSION_EXPIRED", async () => {
    const { user, refreshCookie } = await loginAsNewUser();
    await testPrisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
  });

  it("sem cookie de refresh recebe SESSION_EXPIRED", async () => {
    const response = await request(app.getHttpServer()).post("/api/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
  });

  it("um cookie com valor desconhecido recebe SESSION_EXPIRED", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=token-que-nunca-existiu`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
  });
});
