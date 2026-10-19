import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { authFetch } from "../src/lib/auth/authFetch";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { SessionCacheReset } from "../src/lib/auth/SessionCacheReset";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function LoginAndLogout() {
  const { login, logout, user } = useAuth();
  return (
    <>
      <button onClick={() => void login("usuario@fitburn.local", "SenhaForte123!")}>entrar</button>
      <button onClick={() => void logout()}>sair</button>
      <output>{user ? "logado" : "deslogado"}</output>
    </>
  );
}

describe("Cache de consultas na troca de sessão", () => {
  it("é esvaziado ao sair, para a próxima pessoa não ver dados da anterior", async () => {
    mockSuccessfulLogin("Administrador");
    server.use(http.post("/api/auth/logout", () => HttpResponse.json({})));
    const queryClient = new QueryClient();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SessionCacheReset />
          <LoginAndLogout />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "entrar" }));
    await screen.findByText("logado");
    queryClient.setQueryData(["assignment-options"], { teachers: ["dados da pessoa anterior"] });
    expect(queryClient.getQueryData(["assignment-options"])).toBeDefined();

    await user.click(screen.getByRole("button", { name: "sair" }));

    await waitFor(() => expect(screen.getByText("deslogado")).toBeInTheDocument());
    await waitFor(() => expect(queryClient.getQueryData(["assignment-options"])).toBeUndefined());
  });

  it("não mexe no cache enquanto a sessão está ativa", async () => {
    mockSuccessfulLogin("Administrador");
    const queryClient = new QueryClient();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SessionCacheReset />
          <LoginAndLogout />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "entrar" }));
    await screen.findByText("logado");

    queryClient.setQueryData(["algo"], "valor");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(queryClient.getQueryData(["algo"])).toBe("valor");
  });

  it("encerra a sessão visual quando a renovação recusa usuário inativo", async () => {
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/protegido", () =>
        HttpResponse.json({ code: "USER_INACTIVE", message: "Este usuário está inativo." }, { status: 401 }),
      ),
      http.post("/api/auth/refresh", () =>
        HttpResponse.json({ code: "SESSION_EXPIRED", message: "Sessão expirada." }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginAndLogout />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "entrar" }));
    await screen.findByText("logado");

    const response = await authFetch("/api/protegido");

    expect(response.status).toBe(401);
    await waitFor(() => expect(screen.getByText("deslogado")).toBeInTheDocument());
  });
});
