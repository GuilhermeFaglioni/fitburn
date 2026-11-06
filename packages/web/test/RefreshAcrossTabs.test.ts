import { http, HttpResponse } from "msw";
import { server } from "./msw-server";

/**
 * Duas abas do mesmo navegador: cada uma tem a sua cópia dos módulos de auth
 * (token em memória próprio), mas as duas compartilham o cookie de refresh
 * (httpOnly) e o `navigator.locks`. O servidor simulado imita a API real:
 * cada refresh token vale uma única vez, a renovação rotaciona o cookie e
 * reapresentar um token já consumido revoga todas as sessões.
 */

const LOCK_NAME = "fitburn:auth-refresh";

const USER = {
  id: "user-1",
  email: "usuario@fitburn.local",
  fullName: "Usuário de Teste",
  status: "ACTIVE" as const,
  profile: { id: "profile-1", name: "Cliente" },
  permissions: [],
  onboardingPending: [],
};

// ---------------------------------------------------------------------------
// navigator.locks falso: com `exclusive`, pede/segura/libera com fila (FIFO);
// sem ele, é o controle negativo (todo mundo entra na hora).
// ---------------------------------------------------------------------------

function installLocks({ exclusive }: { exclusive: boolean }) {
  let tail: Promise<unknown> = Promise.resolve();
  const stats = { held: 0, maxHeld: 0, names: [] as string[] };

  const run = <T>(callback: () => Promise<T>) => {
    stats.held += 1;
    stats.maxHeld = Math.max(stats.maxHeld, stats.held);
    return callback().finally(() => {
      stats.held -= 1;
    });
  };

  const locks = {
    request<T>(name: string, callback: (lock: { name: string }) => Promise<T>): Promise<T> {
      stats.names.push(name);
      const work = () => run(() => callback({ name }));
      if (!exclusive) return Promise.resolve().then(work);
      const result = tail.then(work);
      tail = result.catch(() => undefined);
      return result;
    },
  };
  Object.defineProperty(window.navigator, "locks", { configurable: true, value: locks });
  return stats;
}

function removeLocks() {
  Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
}

// ---------------------------------------------------------------------------
// Cookie compartilhado + servidor simulado.
// O cookie é lido no momento do envio e o Set-Cookie é aplicado antes de a
// resposta chegar ao código da aba — como o navegador faz.
// ---------------------------------------------------------------------------

type FailureMode = null | "503" | "network" | "ended";

function createWorld(options: { holdUntilArrivals?: number } = {}) {
  const jar = { cookie: "rt-0" as string | null };
  const server_ = {
    valid: new Set<string>(["rt-0"]),
    consumed: new Set<string>(),
    validAccess: new Set<string>(),
    revoked: false,
    seen: [] as (string | null)[],
    inFlight: 0,
    maxInFlight: 0,
    arrivals: 0,
    issued: 0,
    failNext: null as FailureMode,
    failAlways: null as FailureMode,
  };

  let openGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/auth/refresh")) return realFetch(input, init);
    const headers = new Headers(init?.headers);
    if (jar.cookie) headers.set("x-sim-cookie", jar.cookie);
    const response = await realFetch(input, { ...init, headers });
    const setCookie = response.headers.get("x-sim-set-cookie");
    if (setCookie) jar.cookie = setCookie;
    return response;
  });

  server.use(
    http.post("/api/auth/refresh", async ({ request }) => {
      const cookie = request.headers.get("x-sim-cookie");
      server_.seen.push(cookie);
      server_.inFlight += 1;
      server_.maxInFlight = Math.max(server_.maxInFlight, server_.inFlight);
      server_.arrivals += 1;
      try {
        if (options.holdUntilArrivals) {
          if (server_.arrivals >= options.holdUntilArrivals) openGate();
          await gate;
        }

        const failure = server_.failAlways ?? server_.failNext;
        server_.failNext = null;
        if (failure === "network") return HttpResponse.error();
        if (failure === "503") return HttpResponse.json({ code: "X", message: "x" }, { status: 503 });
        if (failure === "ended") {
          return HttpResponse.json({ code: "SESSION_EXPIRED", message: "x" }, { status: 401 });
        }

        if (!cookie || server_.revoked || !server_.valid.has(cookie)) {
          // Reapresentar um token já consumido revoga todas as sessões.
          if (cookie && server_.consumed.has(cookie)) {
            server_.revoked = true;
            server_.valid.clear();
            server_.validAccess.clear();
          }
          return HttpResponse.json({ code: "SESSION_EXPIRED", message: "x" }, { status: 401 });
        }

        server_.valid.delete(cookie);
        server_.consumed.add(cookie);
        server_.issued += 1;
        const nextCookie = `rt-${server_.issued}`;
        const accessToken = `at-${server_.issued}`;
        server_.valid.add(nextCookie);
        server_.validAccess.add(accessToken);
        return HttpResponse.json(
          { accessToken, user: USER },
          { status: 200, headers: { "x-sim-set-cookie": nextCookie } },
        );
      } finally {
        server_.inFlight -= 1;
      }
    }),
    http.get("/api/protegido", ({ request }) => {
      const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      return server_.validAccess.has(token)
        ? HttpResponse.json({ ok: true })
        : HttpResponse.json({ code: "UNAUTHENTICATED", message: "Expirado." }, { status: 401 });
    }),
  );

  return { jar, state: server_ };
}

// ---------------------------------------------------------------------------
// Uma "aba": instância isolada dos módulos de auth.
// ---------------------------------------------------------------------------

async function openTab() {
  vi.resetModules();
  const [api, fetchModule, tokenModule, events] = await Promise.all([
    import("../src/lib/auth/api"),
    import("../src/lib/auth/authFetch"),
    import("../src/lib/auth/token-store"),
    import("../src/lib/auth/session-events"),
  ]);
  const ended = vi.fn();
  events.onSessionEnded(ended);
  return {
    refresh: api.refreshSessionOutcome,
    authFetch: fetchModule.authFetch,
    tokenStore: tokenModule.tokenStore,
    sessionEnded: ended,
  };
}

async function openTwoTabs() {
  const a = await openTab();
  const b = await openTab();
  expect(a.tokenStore).not.toBe(b.tokenStore);
  return [a, b] as const;
}

afterEach(() => {
  vi.restoreAllMocks();
  removeLocks();
});

describe("renovação da sessão entre abas (cookie de refresh compartilhado)", () => {
  it("restauração simultânea: as duas abas renovam, uma de cada vez, com o cookie vigente", async () => {
    const locks = installLocks({ exclusive: true });
    const world = createWorld();
    const [a, b] = await openTwoTabs();

    const [outcomeA, outcomeB] = await Promise.all([a.refresh(), b.refresh()]);

    expect(outcomeA).toEqual({ status: "ok", user: USER });
    expect(outcomeB).toEqual({ status: "ok", user: USER });
    expect(a.tokenStore.get()).toBe("at-1");
    expect(b.tokenStore.get()).toBe("at-2");
    // Exatamente duas renovações, em sequência, cada uma com o cookie vigente (nunca o antigo).
    expect(world.state.seen).toEqual(["rt-0", "rt-1"]);
    expect(world.state.maxInFlight).toBe(1);
    expect(world.state.revoked).toBe(false);
    expect(world.jar.cookie).toBe("rt-2");
    expect(locks.names).toEqual([LOCK_NAME, LOCK_NAME]);
    expect(locks.maxHeld).toBe(1);
    expect(locks.held).toBe(0);
  });

  it("401 simultâneo nas duas abas: ambas renovam, repetem a requisição e seguem autenticadas", async () => {
    installLocks({ exclusive: true });
    const world = createWorld();
    const [a, b] = await openTwoTabs();
    a.tokenStore.set("token-expirado");
    b.tokenStore.set("token-expirado");

    const [responseA, responseB] = await Promise.all([
      a.authFetch("/api/protegido"),
      b.authFetch("/api/protegido"),
    ]);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(a.tokenStore.get()).toBe("at-1");
    expect(b.tokenStore.get()).toBe("at-2");
    expect(world.state.seen).toEqual(["rt-0", "rt-1"]);
    expect(world.state.revoked).toBe(false);
    expect(a.sessionEnded).not.toHaveBeenCalled();
    expect(b.sessionEnded).not.toHaveBeenCalled();
  });

  it("controle negativo: sem exclusão mútua, as duas abas mandam o mesmo cookie e uma perde a sessão", async () => {
    installLocks({ exclusive: false });
    const world = createWorld({ holdUntilArrivals: 2 });
    const [a, b] = await openTwoTabs();

    const outcomes = await Promise.all([a.refresh(), b.refresh()]);

    expect(world.state.seen).toEqual(["rt-0", "rt-0"]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["ended", "ok"]);
    expect(world.state.revoked).toBe(true);
  });

  it("controle negativo (401): sem exclusão mútua, uma das abas é deslogada e a revogação alcança a outra", async () => {
    installLocks({ exclusive: false });
    const world = createWorld({ holdUntilArrivals: 2 });
    const [a, b] = await openTwoTabs();
    a.tokenStore.set("token-expirado");
    b.tokenStore.set("token-expirado");

    const responses = await Promise.all([a.authFetch("/api/protegido"), b.authFetch("/api/protegido")]);

    expect(world.state.seen).toEqual(["rt-0", "rt-0"]);
    // A aba perdedora é deslogada e a revogação derruba também a sessão da vencedora.
    expect(world.state.revoked).toBe(true);
    expect(responses.map((response) => response.status)).toContain(401);
    expect(a.sessionEnded.mock.calls.length + b.sessionEnded.mock.calls.length).toBe(1);
  });

  it("sessão realmente encerrada: a segunda aba também recebe 'ended', sem repetir em loop", async () => {
    const locks = installLocks({ exclusive: true });
    const world = createWorld();
    world.state.failAlways = "ended";
    const [a, b] = await openTwoTabs();
    a.tokenStore.set("token-a");
    b.tokenStore.set("token-b");

    const outcomes = await Promise.all([a.refresh(), b.refresh()]);

    expect(outcomes).toEqual([{ status: "ended" }, { status: "ended" }]);
    expect(a.tokenStore.get()).toBeNull();
    expect(b.tokenStore.get()).toBeNull();
    expect(world.state.seen).toHaveLength(2);
    expect(locks.held).toBe(0);
  });

  it.each<FailureMode>(["503", "network"])(
    "falha transitória (%s) dentro do lock não prende a outra aba",
    async (failure) => {
      const locks = installLocks({ exclusive: true });
      const world = createWorld();
      world.state.failNext = failure;
      const [a, b] = await openTwoTabs();
      a.tokenStore.set("token-a");

      const [outcomeA, outcomeB] = await Promise.all([a.refresh(), b.refresh()]);

      expect(outcomeA).toEqual({
        status: "transient",
        reason: failure === "network" ? "network" : "server",
      });
      expect(a.tokenStore.get()).toBe("token-a");
      // A falha não consumiu o token: a próxima aba renova com o mesmo cookie.
      expect(outcomeB).toEqual({ status: "ok", user: USER });
      expect(b.tokenStore.get()).toBe("at-1");
      expect(world.state.seen).toEqual(["rt-0", "rt-0"]);
      expect(world.state.maxInFlight).toBe(1);
      expect(locks.held).toBe(0);
    },
  );

  it("sem navigator.locks, a renovação continua funcionando (comportamento anterior)", async () => {
    removeLocks();
    const world = createWorld();
    const [a] = await openTwoTabs();

    expect(window.navigator.locks).toBeUndefined();
    expect(await a.refresh()).toEqual({ status: "ok", user: USER });
    expect(a.tokenStore.get()).toBe("at-1");
    expect(world.state.seen).toEqual(["rt-0"]);
  });

  it("se pedir o lock falhar antes de executar, renova mesmo assim", async () => {
    Object.defineProperty(window.navigator, "locks", {
      configurable: true,
      value: { request: () => Promise.reject(new DOMException("negado", "SecurityError")) },
    });
    const world = createWorld();
    const [a] = await openTwoTabs();

    expect(await a.refresh()).toEqual({ status: "ok", user: USER });
    expect(world.state.seen).toEqual(["rt-0"]);
  });
});
