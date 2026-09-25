import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { LoginPage } from "../src/pages/LoginPage";
import { ProtectedRoute } from "../src/routes/ProtectedRoute";
import { server } from "./msw-server";

function renderApp(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Início do cliente</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard administrativo</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function mockValidSession(permissions: unknown[] = []) {
  server.use(
    http.post("/api/auth/refresh", () =>
      HttpResponse.json(
        {
          accessToken: "novo-access-token",
          user: {
            id: "user-1",
            email: "admin@fitburn.local",
            fullName: "Administradora",
            status: "ACTIVE",
            profile: { id: "profile-1", name: "Administrador" },
            permissions,
          },
        },
        { status: 200 },
      ),
    ),
  );
}

describe("Restauração de sessão ao carregar a página", () => {
  it("uma sessão válida (refresh ok) mantém o usuário na rota protegida, sem passar pelo login", async () => {
    mockValidSession();

    renderApp("/dashboard");

    expect(await screen.findByText("Dashboard administrativo")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bem-vindo de volta" })).not.toBeInTheDocument();
  });

  it("sem sessão válida (refresh falha) redireciona para o login", async () => {
    // O handler padrão global já devolve 401 em /auth/refresh — nenhum
    // override necessário aqui, este é o caso "sem sessão nenhuma".
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Bem-vindo de volta" })).toBeInTheDocument();
  });

  it("visitar /login com uma sessão já restaurada redireciona para o destino do perfil, não mostra o formulário", async () => {
    mockValidSession([{ module: "DASHBOARD", actions: ["VIEW"], scope: "ALL" }]);

    renderApp("/login");

    expect(await screen.findByText("Dashboard administrativo")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bem-vindo de volta" })).not.toBeInTheDocument();
  });
});
