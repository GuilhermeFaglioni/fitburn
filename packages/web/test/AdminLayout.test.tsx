import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  Module,
  PermissionAction,
  PermissionScope,
  type EffectivePermission,
} from "@fitburn/contracts";
import { AdminLayout } from "../src/components/AdminLayout";
import { AppShell } from "../src/components/AppShell";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { ADMIN_MENU_ITEMS } from "../src/lib/auth/areas";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

/**
 * Casca do admin (#156, PR 12, D-038): barra lateral com a marca, as telas do perfil (ordem de `areas.ts`) e a conta;
 * cabeçalho com o botão de tema; contêiner do conteúdo; estados de carregando e offline. Só apresentação: o filtro
 * por perfil e as rotas são os de sempre. O CSS (tokens, celular) é conferido em layout.test.ts.
 */
const ADMIN_PERMISSIONS: EffectivePermission[] = ALL_MODULES.map((module) => ({
  module,
  actions: ALL_PERMISSION_ACTIONS,
  scope: PermissionScope.ALL,
}));

function mockSession(profileName: string, permissions: EffectivePermission[]) {
  server.use(
    http.post("/api/auth/refresh", () =>
      HttpResponse.json({
        accessToken: "token",
        user: {
          id: "user-1",
          email: "usuario@fitburn.local",
          fullName: "Usuário de Teste",
          status: "ACTIVE",
          profile: { id: "profile-1", name: profileName },
          permissions,
          onboardingPending: [],
        },
      }),
    ),
    http.post("/api/auth/logout", () => HttpResponse.json({})),
  );
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppShell>
            <Routes>
              <Route element={<AdminLayout />}>
                {ADMIN_MENU_ITEMS.map((item) => (
                  <Route key={item.to} path={item.to} element={<h1>{item.label} (tela)</h1>} />
                ))}
                <Route path="/perfil" element={<h1>Minha conta (tela)</h1>} />
                <Route path="/privacidade" element={<h1>Privacidade (tela)</h1>} />
              </Route>
            </Routes>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const sidebar = async () => {
  const nav = await screen.findByRole("navigation", { name: "Navegação principal" });
  return nav.closest(".app-menu") as HTMLElement;
};

describe("barra lateral do admin", () => {
  it("lista as telas do menu administrativo na ordem de areas.ts, sem reordenar, e os documentos legais à parte", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");

    const main = within(await screen.findByRole("navigation", { name: "Navegação principal" }));
    expect(main.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      ADMIN_MENU_ITEMS.map((item) => [item.label, item.to]),
    );
    const legal = within(screen.getByRole("navigation", { name: "Documentos legais" }));
    expect(legal.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/privacidade", "/termos"]);
  });

  it("tem a marca, o usuário com o perfil e, no rodapé, Minha conta e Sair", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");

    const side = within(await sidebar());
    expect(side.getByText("FITBURN")).toBeInTheDocument();
    expect(side.getByText("Usuário de Teste")).toBeInTheDocument();
    expect(side.getByText("Administrador")).toBeInTheDocument();
    expect(side.getByRole("link", { name: "Minha conta" })).toHaveAttribute("href", "/perfil");
    expect(side.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it.each([
    ["/dashboard", "Dashboard"],
    ["/clientes", "Clientes"],
    ["/agenda-administrativa", "Agenda"],
    ["/templates-e-modalidades", "Templates & modalidades"],
    ["/atribuicoes", "Atribuições"],
  ])("em %s só o item %s é a página atual (aria-current)", async (path, label) => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt(path);

    const nav = within(await screen.findByRole("navigation", { name: "Navegação principal" }));
    const current = nav.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it("Minha conta é a página atual em /perfil, e nenhum item do menu fica marcado", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/perfil");

    const side = within(await sidebar());
    expect(side.getByRole("link", { name: "Minha conta" })).toHaveAttribute("aria-current", "page");
    const nav = within(screen.getByRole("navigation", { name: "Navegação principal" }));
    expect(nav.getAllByRole("link").some((link) => link.hasAttribute("aria-current"))).toBe(false);
  });

  it("o filtro por perfil não mudou: o professor só vê as telas que as permissões dele abrem", async () => {
    mockSession("Professor", [
      { module: Module.PRESENCA, actions: [PermissionAction.VIEW], scope: PermissionScope.ASSIGNED_CLASSES },
      { module: Module.CLIENTES, actions: [PermissionAction.VIEW], scope: PermissionScope.ASSIGNED_CLIENTS },
      { module: Module.GAMIFICACAO, actions: [PermissionAction.VIEW], scope: PermissionScope.ASSIGNED_CLIENTS },
    ]);
    renderAt("/minhas-aulas");

    const nav = within(await screen.findByRole("navigation", { name: "Navegação principal" }));
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Clientes", "Metas", "Minhas aulas"]);
  });

  it("sem nenhuma tela de menu liberada, não há barra lateral nem botão Menu (como antes)", async () => {
    mockSession("Professor", []);
    renderAt("/dashboard");

    await screen.findByRole("main");
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("Sair encerra a sessão", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");
    const user = userEvent.setup();

    await user.click(within(await sidebar()).getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument());
  });
});

describe("cabeçalho e conteúdo", () => {
  it("o botão de tema mora no cabeçalho da casca (um só, sem o botão fixo do AppShell)", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");

    const header = await screen.findByRole("banner");
    const toggles = screen.getAllByRole("button", { name: /^Tema (claro|escuro)\./ });
    expect(toggles).toHaveLength(1);
    expect(header).toContainElement(toggles[0]);
    expect(toggles[0]).toHaveClass("fb-theme-toggle--inline");
  });

  it("o conteúdo é o main (alvo do salto), com a tela renderizada dentro e o título h1 dela", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/clientes");

    const main = await screen.findByRole("main");
    expect(main).toHaveAttribute("id", "conteudo");
    expect(main).toHaveClass("fb-admin-content");
    expect(within(main).getByRole("heading", { name: "Clientes (tela)", level: 1 })).toBeInTheDocument();
  });

  it("escolher uma tela no menu muda o conteúdo e leva o foco a ele", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");
    const user = userEvent.setup();

    await user.click(within(await sidebar()).getByRole("link", { name: "Planos" }));

    expect(await screen.findByRole("heading", { name: "Planos (tela)", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("estados da casca", () => {
  it("sem usuário ainda (sessão carregando), o conteúdo mostra o estado de carregando e a casca não monta a barra lateral", () => {
    server.use(http.post("/api/auth/refresh", () => new Promise(() => {})));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AppShell>
            <Routes>
              <Route element={<AdminLayout />}>
                <Route path="/dashboard" element={<h1>Dashboard (tela)</h1>} />
              </Route>
            </Routes>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );

    const main = screen.getByRole("main");
    expect(within(main).getByRole("status")).toHaveTextContent("Carregando sua sessão…");
    expect(within(main).getByRole("status")).toHaveAttribute("data-state", "loading");
    expect(within(main).queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
  });

  it("sem conexão, Sair fica indisponível com o motivo e o aviso global continua no topo", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");
    const side = within(await sidebar());

    setBrowserOnline(false);

    await waitFor(() => expect(side.getByRole("button", { name: "Sair" })).toBeDisabled());
    expect(side.getByRole("button", { name: "Sair" })).toHaveAttribute("title", expect.stringMatching(/sem conexão/i));
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão.");
    // A navegação entre telas já carregadas segue disponível.
    expect(side.getByRole("link", { name: "Clientes" })).toBeEnabled();
  });
});
