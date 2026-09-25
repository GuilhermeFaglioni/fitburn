import { http, HttpResponse } from "msw";
import { authFetch } from "../src/lib/auth/authFetch";
import { tokenStore } from "../src/lib/auth/token-store";
import { server } from "./msw-server";

const MOCK_USER = {
  id: "user-1",
  email: "usuario@fitburn.local",
  fullName: "Usuário de Teste",
  status: "ACTIVE" as const,
  profile: { id: "profile-1", name: "Administrador" },
  permissions: [],
};

describe("authFetch", () => {
  beforeEach(() => {
    tokenStore.set("token-expirado");
  });

  it("em caso de 401, renova a sessão uma vez e repete a requisição original", async () => {
    let protectedCalls = 0;
    server.use(
      http.get("/api/protegido", () => {
        protectedCalls += 1;
        return tokenStore.get() === "token-novo"
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ code: "UNAUTHENTICATED", message: "Expirado." }, { status: 401 });
      }),
      http.post("/api/auth/refresh", () =>
        HttpResponse.json({ accessToken: "token-novo", user: MOCK_USER }, { status: 200 }),
      ),
    );

    const response = await authFetch("/api/protegido");

    expect(response.status).toBe(200);
    expect(protectedCalls).toBe(2);
    expect(tokenStore.get()).toBe("token-novo");
  });

  it("se a renovação falhar, devolve a resposta 401 original sem repetir de novo", async () => {
    let protectedCalls = 0;
    server.use(
      http.get("/api/protegido", () => {
        protectedCalls += 1;
        return HttpResponse.json({ code: "UNAUTHENTICATED", message: "Expirado." }, { status: 401 });
      }),
      http.post("/api/auth/refresh", () =>
        HttpResponse.json({ code: "SESSION_EXPIRED", message: "Expirada." }, { status: 401 }),
      ),
    );

    const response = await authFetch("/api/protegido");

    expect(response.status).toBe(401);
    expect(protectedCalls).toBe(1);
    expect(tokenStore.get()).toBeNull();
  });

  it("uma resposta que não é 401 nunca dispara renovação", async () => {
    let refreshCalls = 0;
    server.use(
      http.get("/api/protegido", () => HttpResponse.json({ ok: true })),
      http.post("/api/auth/refresh", () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: "x", user: MOCK_USER });
      }),
    );

    const response = await authFetch("/api/protegido");

    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(0);
  });
});
