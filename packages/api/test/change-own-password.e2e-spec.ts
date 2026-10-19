import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";
import { cleanDatabase } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";

const CURRENT_PASSWORD = "SenhaAtual123!";
const NEW_PASSWORD = "SenhaNova456!";

describe("Troca da própria senha (HTTP)", () => {
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

  function refreshCookie(response: request.Response): string | undefined {
    const raw = response.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return cookies.find((cookie: string) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
  }

  async function createSession() {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({
      email: "marina@fitburn.local",
      password: CURRENT_PASSWORD,
      profileId: profile.id,
    });
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: CURRENT_PASSWORD });

    return {
      user,
      accessToken: login.body.accessToken as string,
      refreshCookie: refreshCookie(login)!,
    };
  }

  function getMe(accessToken: string) {
    return request(app.getHttpServer())
      .get("/api/me")
      .set("Authorization", `Bearer ${accessToken}`);
  }

  it("troca a senha, encerra outras sessões e mantém a sessão atual", async () => {
    const session = await createSession();
    const otherSession = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: session.user.email, password: CURRENT_PASSWORD });

    const changed = await request(app.getHttpServer())
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });

    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      accessToken: expect.any(String),
      user: { id: session.user.id },
    });
    expect(JSON.stringify(changed.body)).not.toContain(NEW_PASSWORD);
    const currentCookie = refreshCookie(changed);
    expect(currentCookie).toBeDefined();

    expect((await getMe(session.accessToken)).status).toBe(401);
    expect((await getMe(otherSession.body.accessToken)).status).toBe(401);
    expect((await getMe(changed.body.accessToken)).status).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/refresh")
          .set("Cookie", session.refreshCookie)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/refresh")
          .set("Cookie", refreshCookie(otherSession)!)
      ).status,
    ).toBe(401);
    expect(
      (await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", currentCookie!))
        .status,
    ).toBe(200);

    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: session.user.email, password: CURRENT_PASSWORD })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: session.user.email, password: NEW_PASSWORD })
      ).status,
    ).toBe(201);
  });

  it("recusa senha atual incorreta sem encerrar nem alterar a sessão", async () => {
    const session = await createSession();

    const response = await request(app.getHttpServer())
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: "SenhaErrada123!", newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("CURRENT_PASSWORD_INVALID");
    expect((await getMe(session.accessToken)).status).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/refresh")
          .set("Cookie", session.refreshCookie)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: session.user.email, password: CURRENT_PASSWORD })
      ).status,
    ).toBe(201);
  });

  it("exige uma sessão autenticada", async () => {
    const session = await createSession();

    const response = await request(app.getHttpServer())
      .post("/api/auth/password")
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(401);
    expect((await getMe(session.accessToken)).status).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: session.user.email, password: CURRENT_PASSWORD })
      ).status,
    ).toBe(201);
  });

  it("aplica a força de senha vigente", async () => {
    const session = await createSession();

    const response = await request(app.getHttpServer())
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: "curta" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect((await getMe(session.accessToken)).status).toBe(200);
  });

  it("serializa troca com login e refresh concorrentes", async () => {
    const session = await createSession();

    const [changed, login, refresh] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/auth/password")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD }),
      request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: session.user.email, password: CURRENT_PASSWORD }),
      request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", session.refreshCookie),
    ]);

    expect(changed.status).toBe(200);
    expect((await getMe(changed.body.accessToken)).status).toBe(200);

    if (login.status === 201) {
      expect((await getMe(login.body.accessToken)).status).toBe(401);
    } else {
      expect(login.status).toBe(401);
    }

    if (refresh.status === 200) {
      expect((await getMe(refresh.body.accessToken)).status).toBe(401);
      expect(
        (
          await request(app.getHttpServer())
            .post("/api/auth/refresh")
            .set("Cookie", refreshCookie(refresh)!)
        ).status,
      ).toBe(401);
    } else {
      expect(refresh.status).toBe(401);
    }
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/refresh")
          .set("Cookie", refreshCookie(changed)!)
      ).status,
    ).toBe(200);
  });
});
