import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { ProfileDetail } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ProfilesPage } from "../src/pages/ProfilesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const CATALOG = {
  modules: ["USUARIOS", "PERFIS_DE_ACESSO", "CLIENTES"],
  actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXECUTE"],
  scopes: ["ALL", "ASSIGNED_CLIENTS", "ASSIGNED_CLASSES", "OWN"],
};

const ADMIN_PROFILE: ProfileDetail = {
  id: "profile-admin",
  name: "Administrador",
  description: null,
  isSystem: true,
  isActive: true,
  moduleAccess: [],
};

const CLIENT_PROFILE: ProfileDetail = {
  id: "profile-cliente",
  name: "Cliente",
  description: null,
  isSystem: true,
  isActive: true,
  moduleAccess: [{ module: "USUARIOS", actions: ["VIEW"], scope: "OWN" }],
};

const CUSTOM_PROFILE: ProfileDetail = {
  id: "profile-recepcao",
  name: "Recepção",
  description: "Equipe da recepção",
  isSystem: false,
  isActive: true,
  moduleAccess: [],
};

function LoggedInProfilesPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <ProfilesPage />;
}

function renderProfilesPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/perfis-de-acesso"]}>
          <LoggedInProfilesPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ProfilesPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/profiles/catalog", () => HttpResponse.json(CATALOG)),
      http.get("/api/profiles", () =>
        HttpResponse.json([ADMIN_PROFILE, CLIENT_PROFILE, CUSTOM_PROFILE]),
      ),
    );
  });

  it("edita a matriz de um perfil customizado e salva", async () => {
    let savedBody: { actions: string[]; scope: string } | null = null;
    server.use(
      http.put("/api/profiles/:id/module-access/:module", async ({ request, params }) => {
        savedBody = (await request.json()) as { actions: string[]; scope: string };
        return HttpResponse.json({
          ...CUSTOM_PROFILE,
          moduleAccess: [{ module: params.module, ...savedBody }],
        });
      }),
    );

    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Recepção" }));
    await screen.findByText("Matriz de permissões — Recepção");

    const clientesRow = screen.getByRole("row", { name: /Clientes/ });
    await user.click(within(clientesRow).getByRole("checkbox", { name: /Visualizar em Clientes/ }));
    await user.selectOptions(
      within(clientesRow).getByRole("combobox", { name: "Escopo de Clientes" }),
      "ALL",
    );
    await user.click(within(clientesRow).getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(savedBody).toMatchObject({ actions: ["VIEW"], scope: "ALL" });
    });
  });

  it("trocar de perfil atualiza a matriz para os dados do novo perfil selecionado", async () => {
    renderProfilesPage();
    const user = userEvent.setup();

    // Administrador primeiro: nenhuma linha tem ação marcada.
    await user.click(await screen.findByRole("button", { name: "Administrador" }));
    await screen.findByText("Matriz de permissões — Administrador");

    // Cliente depois: a linha de Usuários já vem com "Visualizar" marcado
    // (moduleAccess seedado). Reaproveitar o estado da linha do Administrador
    // em vez de reinicializar a partir do Cliente seria o bug regressivo.
    await user.click(screen.getByRole("button", { name: "Cliente" }));
    await screen.findByText("Matriz de permissões — Cliente");

    const usuariosRow = screen.getByRole("row", { name: /Usuários/ });
    expect(
      within(usuariosRow).getByRole("checkbox", { name: "Visualizar em Usuários" }),
    ).toBeChecked();
  });

  it("mostra o isolamento do Cliente como fixo, sem seletor de escopo editável", async () => {
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Cliente" }));

    expect(await screen.findByText(/isolamento do cliente/i)).toBeInTheDocument();
    expect(screen.getAllByText(/registros próprios \(fixo\)/i)).toHaveLength(CATALOG.modules.length);
    expect(screen.queryByRole("combobox", { name: "Escopo de Usuários" })).not.toBeInTheDocument();
  });

  it("bloqueia a edição da matriz do Administrador", async () => {
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Administrador" }));

    expect(await screen.findByText(/administrador sempre tem acesso total/i)).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled();
    }
  });

  it("não mostra ações de desativar/reativar para perfis de sistema", async () => {
    renderProfilesPage();

    const clientListItem = (await screen.findByRole("button", { name: "Cliente" })).closest("li")!;
    expect(within(clientListItem).queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    expect(within(clientListItem).queryByRole("button", { name: "Reativar" })).not.toBeInTheDocument();

    const customListItem = screen.getByRole("button", { name: "Recepção" }).closest("li")!;
    expect(within(customListItem).getByRole("button", { name: "Desativar" })).toBeInTheDocument();
  });
});
