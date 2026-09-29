import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  PermissionScope,
  type EffectivePermission,
} from "@fitburn/contracts";
import App, { AppRoutes } from "../src/App";
import { AppShell } from "../src/components/AppShell";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { server } from "./msw-server";

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
        },
      }),
    ),
    http.get("/api/dashboard", () => new Promise(() => {})),
    http.get("/api/clients", () => HttpResponse.json([])),
    http.get("/api/agenda", () => HttpResponse.json([])),
    http.get("/api/plans/mine", () => HttpResponse.json({ active: null, history: [] })),
    http.get("/api/attendance/classes/:id", () => new Promise(() => {})),
  );
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("casca administrativa no mobile", () => {
  beforeEach(() => mockSession("Administrador", ADMIN_PERMISSIONS));

  it("o botão Menu abre e fecha a navegação, refletindo o estado em aria-expanded", async () => {
    renderAt("/dashboard");
    const user = userEvent.setup();

    const toggle = await screen.findByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls") as string);
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole("link", { name: "Clientes" })).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("fecha o menu com Esc e devolve o foco ao botão Menu", async () => {
    renderAt("/dashboard");
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Menu" });
    await user.click(toggle);

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("fecha o menu ao escolher uma tela", async () => {
    renderAt("/dashboard");
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Menu" });
    await user.click(toggle);

    await user.click(screen.getByRole("link", { name: "Clientes" }));

    expect(await screen.findByRole("heading", { name: "Clientes", level: 1 })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("foco ao trocar de tela", () => {
  it("na casca administrativa, escolher uma tela no menu leva o foco ao conteúdo", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Dashboard", level: 1 });

    await user.click(screen.getByRole("link", { name: "Clientes" }));

    expect(await screen.findByRole("heading", { name: "Clientes", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("na casca do cliente, escolher uma tela na barra leva o foco ao conteúdo", async () => {
    mockSession("Cliente", []);
    renderAt("/plano");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Plano", level: 1 });

    await user.click(
      within(screen.getByRole("navigation", { name: "Navegação inferior" })).getByRole("link", {
        name: "Agenda",
      }),
    );

    expect(await screen.findByRole("heading", { name: "Agenda", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("ao abrir a tela pela primeira vez, o foco não é roubado do início da página", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");

    await screen.findByRole("heading", { name: "Dashboard", level: 1 });

    expect(screen.getByRole("main")).not.toHaveFocus();
  });
});

describe("landmarks e salto de navegação", () => {
  it("a casca oferece 'Ir para o conteúdo' como primeiro item da tabulação, apontando para o main", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/dashboard");
    const user = userEvent.setup();

    const skip = await screen.findByRole("link", { name: "Ir para o conteúdo" });
    await user.tab();

    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#conteudo");
    expect(screen.getByRole("main")).toHaveAttribute("id", "conteudo");
  });

  it("o main do cliente também é o alvo do salto", async () => {
    mockSession("Cliente", []);
    renderAt("/plano");

    await screen.findByRole("heading", { name: "Plano", level: 1 });

    expect(screen.getByRole("main")).toHaveAttribute("id", "conteudo");
  });

  it("a tela de Presença (tela cheia) tem um main", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);
    renderAt("/presenca/o-1");

    expect(await screen.findByRole("main")).toHaveAttribute("id", "conteudo");
  });

  it("o login tem um main com o formulário", async () => {
    renderAt("/login");

    const main = await screen.findByRole("main");
    expect(
      within(main).getByRole("heading", { name: "Bem-vindo de volta", level: 1 }),
    ).toBeInTheDocument();
  });

  it("a aplicação inteira monta a casca com o salto de navegação", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: "Ir para o conteúdo" })).toBeInTheDocument();
  });
});
