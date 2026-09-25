import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { Module, PermissionAction, PermissionScope, type EffectivePermission } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { UsuariosPerfisPage } from "../src/pages/UsuariosPerfisPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const CATALOG = {
  modules: ["USUARIOS", "PERFIS_DE_ACESSO"],
  actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXECUTE"],
  scopes: ["ALL", "ASSIGNED_CLIENTS", "ASSIGNED_CLASSES", "OWN"],
};

const USUARIOS_ONLY: EffectivePermission[] = [
  { module: Module.USUARIOS, actions: [PermissionAction.VIEW], scope: PermissionScope.ALL },
];

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <UsuariosPerfisPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/usuarios"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("UsuariosPerfisPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/profiles/catalog", () => HttpResponse.json(CATALOG)),
      http.get("/api/profiles", () => HttpResponse.json([])),
      http.get("/api/users", () => HttpResponse.json([])),
    );
  });

  it("mostra as duas abas para quem tem acesso a ambos os módulos e alterna o conteúdo", async () => {
    mockSuccessfulLogin("Administrador");
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Usuários e perfis de acesso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuários" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perfis de acesso" })).toBeInTheDocument();

    expect(await screen.findByPlaceholderText("Buscar por nome ou e-mail")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Perfis de acesso" }));
    expect(screen.queryByPlaceholderText("Buscar por nome ou e-mail")).not.toBeInTheDocument();
  });

  it("mostra só a aba Usuários para quem não tem acesso a Perfis de acesso", async () => {
    mockSuccessfulLogin("Administrador", USUARIOS_ONLY);
    renderPage();

    expect(await screen.findByPlaceholderText("Buscar por nome ou e-mail")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perfis de acesso" })).not.toBeInTheDocument();
  });
});
