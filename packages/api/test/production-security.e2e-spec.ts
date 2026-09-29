import { InternalServerErrorException, Logger, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { ErrorCode } from "@fitburn/contracts";
import { AppConfigError, loadAppConfig } from "../src/config/app-config.js";
import { UsersService } from "../src/users/users.service.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { cleanDatabase } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";
import { validProductionEnv } from "./production-env.js";
import { REFRESH_COOKIE_NAME } from "../src/auth/refresh-cookie.js";

const PASSWORD = "SenhaForte123!";

function setCookieHeaders(response: request.Response): string[] {
  const raw = response.headers["set-cookie"];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function refreshCookieHeader(response: request.Response): string {
  const header = setCookieHeaders(response).find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!header) throw new Error("Resposta sem cookie de refresh.");
  return header;
}

async function createClientUser() {
  const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
  return createUser({ email: "cliente@fitburn.local", password: PASSWORD, profileId: profile.id });
}

describe("Segurança em configuração de produção (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ env: { ...validProductionEnv, AUTH_RATE_LIMIT_MAX: "1000" } });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe("headers de segurança", () => {
    it("estão presentes em respostas de sucesso", async () => {
      const response = await request(app.getHttpServer()).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
      expect(response.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
      expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
      expect(response.headers["referrer-policy"]).toBeDefined();
      expect(response.headers["cross-origin-resource-policy"]).toBeDefined();
    });

    it("estão presentes também em respostas de erro", async () => {
      const response = await request(app.getHttpServer()).get("/api/rota-que-nao-existe");

      expect(response.status).toBe(404);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    });

    it("não revelam a tecnologia do servidor", async () => {
      const response = await request(app.getHttpServer()).get("/api/health");

      expect(response.headers["x-powered-by"]).toBeUndefined();
    });

    it("respostas da API não são armazenadas em cache (contêm tokens e dados pessoais)", async () => {
      const user = await createClientUser();

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: PASSWORD });

      expect(response.headers["cache-control"]).toBe("no-store");
    });
  });

  describe("CORS restrito", () => {
    const allowedOrigin = "https://app.academia.example";
    let corsApp: INestApplication;

    beforeAll(async () => {
      corsApp = await createTestApp({
        env: { ...validProductionEnv, CORS_ALLOWED_ORIGINS: `${allowedOrigin}, https://admin.academia.example` },
      });
    });

    afterAll(async () => {
      await corsApp.close();
    });

    it("libera, com credenciais, as origens configuradas", async () => {
      const response = await request(corsApp.getHttpServer())
        .get("/api/health")
        .set("Origin", allowedOrigin);

      expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("libera a segunda origem da lista", async () => {
      const response = await request(corsApp.getHttpServer())
        .get("/api/health")
        .set("Origin", "https://admin.academia.example");

      expect(response.headers["access-control-allow-origin"]).toBe("https://admin.academia.example");
    });

    it("não libera origens fora da lista", async () => {
      const response = await request(corsApp.getHttpServer())
        .get("/api/health")
        .set("Origin", "https://site-malicioso.example");

      // Sem Access-Control-Allow-Origin o navegador bloqueia a leitura da resposta.
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("responde o preflight só para origens configuradas", async () => {
      const allowed = await request(corsApp.getHttpServer())
        .options("/api/auth/login")
        .set("Origin", allowedOrigin)
        .set("Access-Control-Request-Method", "POST");
      const denied = await request(corsApp.getHttpServer())
        .options("/api/auth/login")
        .set("Origin", "https://site-malicioso.example")
        .set("Access-Control-Request-Method", "POST");

      expect(allowed.headers["access-control-allow-origin"]).toBe(allowedOrigin);
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("sem CORS_ALLOWED_ORIGINS nenhuma origem cruzada é liberada (app e API na mesma origem)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/health")
        .set("Origin", allowedOrigin);

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("recusa iniciar com origem curinga ou malformada", async () => {
      await expect(
        createTestApp({ env: { ...validProductionEnv, CORS_ALLOWED_ORIGINS: "*" } }),
      ).rejects.toThrow(/CORS_ALLOWED_ORIGINS/);
      await expect(
        createTestApp({ env: { ...validProductionEnv, CORS_ALLOWED_ORIGINS: "app.academia.example" } }),
      ).rejects.toThrow(/CORS_ALLOWED_ORIGINS/);
    });
  });

  describe("erros não expõem detalhes internos", () => {
    const internalDetail =
      "connect ECONNREFUSED postgresql://fitburn:hunter2-db-secret@10.0.0.5:5432/fitburn_prod";

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("erro inesperado devolve só o envelope padrão, sem stack nem mensagem interna", async () => {
      const failure = new Error(internalDetail);
      vi.spyOn(app.get(UsersService), "findByEmail").mockRejectedValueOnce(failure);
      vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "alguem@fitburn.local", password: PASSWORD });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Erro interno inesperado.",
      });
      expect(response.text).not.toContain("hunter2-db-secret");
      expect(response.text).not.toContain("ECONNREFUSED");
      expect(response.text).not.toMatch(/\bat\s.+\(.+:\d+:\d+\)/);
    });

    it("HttpException 5xx com mensagem própria também vira mensagem genérica", async () => {
      vi.spyOn(app.get(UsersService), "findByEmail").mockRejectedValueOnce(
        new InternalServerErrorException(internalDetail),
      );
      vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "alguem@fitburn.local", password: PASSWORD });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Erro interno inesperado.",
      });
    });

    it("corpo JSON malformado devolve o envelope de validação, sem stack do parser", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": "a@b.c", "password": ');

      expect(response.status).toBe(400);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(Object.keys(response.body).sort()).toEqual(["code", "message"]);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.text).not.toMatch(/SyntaxError|node_modules|\.js:\d+/);
    });

    it("corpo grande demais devolve 413 no envelope padrão", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "a@b.c", password: "x".repeat(300_000) });

      expect(response.status).toBe(413);
      expect(Object.keys(response.body).sort()).toEqual(["code", "message"]);
      expect(response.text).not.toMatch(/PayloadTooLargeError|node_modules|\.js:\d+/);
    });

    it("rota inexistente devolve o envelope padrão", async () => {
      const response = await request(app.getHttpServer()).get("/api/nao-existe");

      expect(response.status).toBe(404);
      expect(Object.keys(response.body).sort()).toEqual(["code", "message"]);
    });
  });

  describe("senhas nunca aparecem em respostas nem em logs", () => {
    let logged: string[];

    beforeEach(() => {
      logged = [];
      const capture = (chunk: unknown): boolean => {
        logged.push(String(chunk));
        return true;
      };
      vi.spyOn(process.stdout, "write").mockImplementation(capture);
      vi.spyOn(process.stderr, "write").mockImplementation(capture);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function loginAsAdmin() {
      const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
      await createAccessProfile({ name: "Cliente", isSystem: true });
      const admin = await createUser({ email: "admin@fitburn.local", password: PASSWORD, profileId: profile.id });
      const token = await loginAndGetAccessToken(app, admin.email, PASSWORD);
      return { admin, token };
    }

    it("respostas de usuários não trazem senha nem hash", async () => {
      const { token } = await loginAsAdmin();
      const clientPassword = "OutraSenhaForte456!";

      const created = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Cliente Teste",
          email: "cliente@fitburn.local",
          phone: "31999990000",
          birthDate: "1990-05-20",
          document: "12345678900",
          address: "Rua Um, 123",
          password: clientPassword,
        });
      const list = await request(app.getHttpServer())
        .get("/api/users")
        .set("Authorization", `Bearer ${token}`);
      const detail = await request(app.getHttpServer())
        .get(`/api/users/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      const me = await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(created.status).toBe(201);
      for (const response of [created, list, detail, me]) {
        expect(response.text).not.toContain(clientPassword);
        expect(response.text).not.toContain(PASSWORD);
        expect(response.text).not.toMatch(/passwordHash|password_hash|"password"|\$argon2/i);
      }
    });

    it("login com senha errada não devolve nem registra a senha", async () => {
      const user = await createClientUser();
      const wrongPassword = "SenhaErradaQueNaoDeveVazar!1";

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: wrongPassword });

      expect(response.status).toBe(401);
      expect(response.text).not.toContain(wrongPassword);
      expect(logged.join("")).not.toContain(wrongPassword);
    });

    it("requisição inválida com senha no corpo não devolve nem registra a senha", async () => {
      const secret = "SenhaNoCorpoInvalido!77";

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "isso-nao-e-email", password: secret });

      expect(response.status).toBe(400);
      expect(response.text).not.toContain(secret);
      expect(logged.join("")).not.toContain(secret);
    });

    it("erro inesperado cuja mensagem carrega senha ou hash é registrado com esses valores mascarados", async () => {
      const secret = "SenhaQueVazouNaMensagem!99";
      const hash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaGhhc2hoYXNoaGFzaA";
      const failure = new Error(
        `Invalid \`prisma.user.create()\` invocation: data: { password: "${secret}", passwordHash: "${hash}" }`,
      );
      vi.spyOn(app.get(UsersService), "findByEmail").mockRejectedValueOnce(failure);

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "alguem@fitburn.local", password: PASSWORD });

      expect(response.status).toBe(500);
      const output = logged.join("");
      expect(output).toContain("Invalid `prisma.user.create()` invocation");
      expect(output).not.toContain(secret);
      expect(output).not.toContain(hash);
    });
  });

  describe("cookie de refresh", () => {
    it("no login é HttpOnly, Secure e SameSite", async () => {
      const user = await createClientUser();

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: PASSWORD });

      expect(response.status).toBe(201);
      const cookie = refreshCookieHeader(response);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*SameSite=(Lax|Strict)/i);
    });

    it("mantém os mesmos flags depois da rotação no refresh", async () => {
      const user = await createClientUser();
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: PASSWORD });

      const response = await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .set("Cookie", refreshCookieHeader(login));

      expect(response.status).toBe(200);
      const cookie = refreshCookieHeader(response);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*SameSite=(Lax|Strict)/i);
    });

    it("o token de refresh nunca aparece no corpo da resposta", async () => {
      const user = await createClientUser();

      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: PASSWORD });

      expect(Object.keys(response.body).sort()).toEqual(["accessToken", "user"]);
    });
  });
});

describe("Rate limiting em produção (HTTP)", () => {
  const apps: INestApplication[] = [];

  async function appWith(extraEnv: NodeJS.ProcessEnv): Promise<INestApplication> {
    const created = await createTestApp({ env: { ...validProductionEnv, ...extraEnv } });
    apps.push(created);
    return created;
  }

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  function attemptLogin(target: INestApplication, email = "ninguem@fitburn.local", ip?: string) {
    const req = request(target.getHttpServer()).post("/api/auth/login");
    if (ip) req.set("X-Forwarded-For", ip);
    return req.send({ email, password: "senha-errada" });
  }

  it("por padrão permite 10 tentativas de login por minuto e bloqueia a 11ª", async () => {
    const limited = await appWith({});

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await attemptLogin(limited)).status);

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("a resposta bloqueada usa o envelope padrão e informa Retry-After", async () => {
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "2" });
    await attemptLogin(limited);
    await attemptLogin(limited);

    const response = await attemptLogin(limited);

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("conta tentativas certas e erradas: login bem-sucedido também consome a cota", async () => {
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "2" });
    const user = await createClientUser();
    const login = () =>
      request(limited.getHttpServer()).post("/api/auth/login").send({ email: user.email, password: PASSWORD });

    expect((await login()).status).toBe(201);
    expect((await login()).status).toBe(201);
    expect((await login()).status).toBe(429);
  });

  it("limita também o refresh", async () => {
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "2" });
    const refresh = () => request(limited.getHttpServer()).post("/api/auth/refresh");

    expect((await refresh()).status).toBe(401);
    expect((await refresh()).status).toBe(401);
    expect((await refresh()).status).toBe(429);
  });

  it("não limita os demais endpoints", async () => {
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "1" });

    for (let i = 0; i < 5; i++) {
      expect((await request(limited.getHttpServer()).get("/api/health")).status).toBe(200);
    }
  });

  it("o preflight de CORS não consome a cota", async () => {
    const origin = "https://app.academia.example";
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "1", CORS_ALLOWED_ORIGINS: origin });

    for (let i = 0; i < 3; i++) {
      await request(limited.getHttpServer())
        .options("/api/auth/login")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST");
    }

    expect((await attemptLogin(limited)).status).toBe(401);
  });

  it("a resposta 429 também traz os headers de CORS, para o navegador conseguir ler o erro", async () => {
    const origin = "https://app.academia.example";
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "1", CORS_ALLOWED_ORIGINS: origin });
    await attemptLogin(limited);

    const response = await attemptLogin(limited).set("Origin", origin);

    expect(response.status).toBe(429);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("atrás do proxy (TRUST_PROXY_HOPS=1) cada IP de cliente tem a sua cota", async () => {
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "1", TRUST_PROXY_HOPS: "1" });

    expect((await attemptLogin(limited, undefined, "203.0.113.10")).status).toBe(401);
    expect((await attemptLogin(limited, undefined, "203.0.113.10")).status).toBe(429);
    expect((await attemptLogin(limited, undefined, "203.0.113.11")).status).toBe(401);
  });

  it("sem proxy confiável, X-Forwarded-For forjado não contorna o limite", async () => {
    const limited = await appWith({ AUTH_RATE_LIMIT_MAX: "1", TRUST_PROXY_HOPS: "0" });

    expect((await attemptLogin(limited, undefined, "203.0.113.10")).status).toBe(401);
    expect((await attemptLogin(limited, undefined, "203.0.113.11")).status).toBe(429);
  });

  it("recusa iniciar com limite ou janela inválidos", () => {
    for (const bad of [{ AUTH_RATE_LIMIT_MAX: "0" }, { AUTH_RATE_LIMIT_MAX: "abc" }, { AUTH_RATE_LIMIT_WINDOW_SECONDS: "-5" }, { TRUST_PROXY_HOPS: "x" }]) {
      expect(() => loadAppConfig({ ...validProductionEnv, ...bad })).toThrow(AppConfigError);
    }
  });
});

describe("Ambiente de teste/desenvolvimento não recebe as travas de produção", () => {
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

  it("não aplica rate limit no login (a suíte de testes faz muitos logins seguidos)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "ninguem@fitburn.local", password: "senha-errada" });
      statuses.push(response.status);
    }

    expect(statuses.every((s) => s === 401)).toBe(true);
  });

  it("aceita qualquer origem (o dev server do Vite chama a API de outra origem)", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("o cookie de refresh não é Secure (o navegador o aceitaria em http://localhost)", async () => {
    const user = await createClientUser();

    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });

    const cookie = refreshCookieHeader(response);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });
});
