import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";
import { lockUserRow } from "../src/users/user-row-lock.js";

const PASSWORD = "SenhaForte123!";
const CONCURRENT_REQUESTS = 4;
const LOCK_POLL_INTERVAL_MS = 20;
const LOCK_WAIT_ATTEMPTS = 250; // ~5s no total: falha com mensagem clara em vez de travar.

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

  /** Devolve só o par `nome=valor` do cookie de refresh, pronto para o header `Cookie`. */
  function refreshCookieFrom(response: request.Response): string {
    const raw = response.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cookie = cookies.find((c: string) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    if (!cookie) throw new Error("Resposta sem cookie de refresh");
    return cookie.split(";")[0]!;
  }

  /** Dispara a requisição já: o supertest só envia quando é `.end`/`await`-ado. */
  function postRefresh(cookie: string): Promise<request.Response> {
    return new Promise((resolve, reject) => {
      request(app.getHttpServer())
        .post("/api/auth/refresh")
        .set("Cookie", cookie)
        .end((error, response) => (error ? reject(error) : resolve(response)));
    });
  }

  async function loginAsNewUser() {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({ email: "cliente@fitburn.local", password: PASSWORD, profileId: profile.id });
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });
    return { user, refreshCookie: refreshCookieFrom(login) };
  }

  function countRefreshTokens(userId: string): Promise<number> {
    return testPrisma.refreshToken.count({ where: { userId } });
  }

  function countActiveRefreshTokens(userId: string): Promise<number> {
    return testPrisma.refreshToken.count({ where: { userId, revokedAt: null } });
  }

  /**
   * Espera, por consulta a `pg_stat_activity`, até `expected` backends estarem bloqueados
   * esperando o `FOR UPDATE` da linha do usuário. Poll curto com limite de tentativas:
   * não há sleep fixo, e a espera só termina quando a sobreposição realmente aconteceu.
   */
  async function waitForRequestsBlockedOnUserRow(expected: number): Promise<void> {
    let blocked = 0;
    for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt += 1) {
      const [row] = await testPrisma.$queryRaw<Array<{ blocked: number }>>`
        SELECT count(*)::int AS blocked
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%FROM users%'
          AND query ILIKE '%FOR UPDATE%'
      `;
      blocked = row?.blocked ?? 0;
      if (blocked >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
    }
    throw new Error(
      `Esperava ${expected} requisições bloqueadas no lock da linha do usuário, viram ${blocked}.`,
    );
  }

  it("rotaciona: emite novo access e refresh token e revoga o anterior", async () => {
    const { refreshCookie } = await loginAsNewUser();

    const response = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    const newRefreshCookie = refreshCookieFrom(response);
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
    const secondCookie = refreshCookieFrom(first);

    const second = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", secondCookie);

    expect(second.status).toBe(200);
  });

  // Pela política atual, quem perde a corrida apresenta um token já revogado e isso conta como
  // reuso: todas as sessões ativas da conta são revogadas, inclusive o sucessor que o vencedor
  // acabou de receber. Por isso o cookie do vencedor também deixa de renovar. Esse teste afirma
  // esse estado real sem mudar a política; evitar a corrida com requisições legítimas é papel
  // da coordenação entre abas no cliente.
  it("requisições simultâneas com o mesmo refresh token: só uma renova e o estado persistido fica consistente", async () => {
    const { user, refreshCookie } = await loginAsNewUser();
    const originalToken = await testPrisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    const tokensBefore = await countRefreshTokens(user.id);

    // Segura o mesmo lock da linha do usuário que a rotação usa. Nenhuma renovação avança
    // enquanto o holder não liberar: a sobreposição é garantida, não torcida.
    let signalLocked!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holder = testPrisma.$transaction(
      async (tx) => {
        await lockUserRow(tx, user.id);
        signalLocked();
        await lockReleased;
      },
      { timeout: 30_000 },
    );
    await Promise.race([lockAcquired, holder]);

    const pending = Array.from({ length: CONCURRENT_REQUESTS }, () => postRefresh(refreshCookie));
    try {
      await waitForRequestsBlockedOnUserRow(CONCURRENT_REQUESTS);
    } finally {
      releaseLock();
      await holder;
    }
    const responses = await Promise.all(pending);

    const winners = responses.filter((response) => response.status === 200);
    const losers = responses.filter((response) => response.status !== 200);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(CONCURRENT_REQUESTS - 1);
    for (const loser of losers) {
      expect(loser.status).toBe(401);
      expect(loser.body.code).toBe("SESSION_EXPIRED");
    }

    // Estado persistido: exatamente um sucessor criado a partir do token consumido.
    expect(await countRefreshTokens(user.id)).toBe(tokensBefore + 1);
    const consumed = await testPrisma.refreshToken.findUnique({ where: { id: originalToken.id } });
    expect(consumed?.revokedAt).not.toBeNull();

    // Estado real da política de reuso: as sessões ativas foram todas revogadas.
    expect(await countActiveRefreshTokens(user.id)).toBe(0);
    const winnerCookie = refreshCookieFrom(winners[0]!);
    const winnerRetry = await postRefresh(winnerCookie);
    expect(winnerRetry.status).toBe(401);
    expect(winnerRetry.body.code).toBe("SESSION_EXPIRED");
    expect(await countRefreshTokens(user.id)).toBe(tokensBefore + 1);
  }, 15_000);

  it("reusar um refresh token já rotacionado revoga todas as sessões do usuário", async () => {
    const { user, refreshCookie } = await loginAsNewUser();

    const first = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(first.status).toBe(200);
    const tokensAfterRotation = await countRefreshTokens(user.id);

    // Reusa o cookie ORIGINAL, já revogado pela primeira rotação.
    const reuse = await request(app.getHttpServer()).post("/api/auth/refresh").set("Cookie", refreshCookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("SESSION_EXPIRED");

    const activeSessions = await testPrisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(activeSessions).toBe(0);
    expect(await countRefreshTokens(user.id)).toBe(tokensAfterRotation);
  });

  it("um refresh token expirado é recusado com SESSION_EXPIRED", async () => {
    const { user, refreshCookie } = await loginAsNewUser();
    await testPrisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const before = await countRefreshTokens(user.id);

    const response = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
    expect(await countRefreshTokens(user.id)).toBe(before);
  });

  it("após logout, reapresentar o cookie antigo é recusado e não cria sucessor", async () => {
    const { user, refreshCookie } = await loginAsNewUser();

    const logout = await request(app.getHttpServer()).post("/api/auth/logout").set("Cookie", refreshCookie);
    expect(logout.status).toBe(204);
    const before = await countRefreshTokens(user.id);

    const response = await postRefresh(refreshCookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
    expect(await countRefreshTokens(user.id)).toBe(before);
  });

  it("com tokenVersion desatualizado (troca de senha) o refresh é recusado e não cria sucessor", async () => {
    const { user, refreshCookie } = await loginAsNewUser();
    await testPrisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    const before = await countRefreshTokens(user.id);

    const response = await postRefresh(refreshCookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
    expect(await countRefreshTokens(user.id)).toBe(before);
  });

  it("com usuário inativo o refresh é recusado e não cria sucessor", async () => {
    const { user, refreshCookie } = await loginAsNewUser();
    await testPrisma.user.update({
      where: { id: user.id },
      data: { status: "INACTIVE" },
    });
    const before = await countRefreshTokens(user.id);

    const response = await postRefresh(refreshCookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_EXPIRED");
    expect(await countRefreshTokens(user.id)).toBe(before);
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
