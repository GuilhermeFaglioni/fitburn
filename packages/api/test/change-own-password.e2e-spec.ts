import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
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

  async function waitForUserLockWaiters(expectedCount: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [activity] = await testPrisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%FROM users%'
          AND query ILIKE '%FOR UPDATE%'
      `;
      if ((activity?.count ?? 0) >= expectedCount) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Esperava ${expectedCount} requisição(ões) aguardando o lock do usuário.`);
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
    let changedPromise: Promise<request.Response> | undefined;
    let loginPromise: Promise<request.Response> | undefined;
    let refreshPromise: Promise<request.Response> | undefined;

    await testPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.user.id} FOR UPDATE`;

      changedPromise = Promise.resolve(
        request(app.getHttpServer())
          .post("/api/auth/password")
          .set("Authorization", `Bearer ${session.accessToken}`)
          .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD }),
      );
      await waitForUserLockWaiters(1);

      loginPromise = Promise.resolve(
        request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: session.user.email, password: CURRENT_PASSWORD }),
      );
      refreshPromise = Promise.resolve(
        request(app.getHttpServer())
          .post("/api/auth/refresh")
          .set("Cookie", session.refreshCookie),
      );
      await waitForUserLockWaiters(3);
    });

    if (!changedPromise || !loginPromise || !refreshPromise) {
      throw new Error("As requisições concorrentes não foram iniciadas.");
    }
    const [changed, login, refresh] = await Promise.all([
      changedPromise,
      loginPromise,
      refreshPromise,
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
