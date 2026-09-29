import { http, HttpResponse } from "msw";
import { refreshSession } from "../src/lib/auth/api";
import { tokenStore } from "../src/lib/auth/token-store";
import { server } from "./msw-server";

const USER = {
  id: "user-1",
  email: "usuario@fitburn.local",
  fullName: "Usuário de Teste",
  status: "ACTIVE" as const,
  profile: { id: "profile-1", name: "Cliente" },
  permissions: [],
};

function refreshRespondsWith(status: number, body: Record<string, unknown> = { code: "X", message: "x" }) {
  server.use(http.post("/api/auth/refresh", () => HttpResponse.json(body, { status })));
}

describe("refreshSession: só 401/403 encerram a sessão", () => {
  beforeEach(() => {
    tokenStore.set("token-em-memoria");
  });

  it.each([401, 403])("resposta %i devolve 'sem sessão' e descarta o token", async (status) => {
    refreshRespondsWith(status);

    expect(await refreshSession()).toBeNull();
    expect(tokenStore.get()).toBeNull();
  });

  it.each([429, 500, 502, 503, 504])(
    "resposta %i é falha transitória: o token da sessão é mantido",
    async (status) => {
      refreshRespondsWith(status);

      expect(await refreshSession()).toBeNull();
      expect(tokenStore.get()).toBe("token-em-memoria");
    },
  );

  it("erro de proxy com corpo não-JSON (ex.: página HTML do Nginx) também mantém o token", async () => {
    server.use(
      http.post("/api/auth/refresh", () =>
        new HttpResponse("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
      ),
    );

    expect(await refreshSession()).toBeNull();
    expect(tokenStore.get()).toBe("token-em-memoria");
  });

  it("uma resposta 200 renova o token e devolve o usuário", async () => {
    refreshRespondsWith(200, { accessToken: "token-novo", user: USER });

    expect(await refreshSession()).toEqual(USER);
    expect(tokenStore.get()).toBe("token-novo");
  });
});
