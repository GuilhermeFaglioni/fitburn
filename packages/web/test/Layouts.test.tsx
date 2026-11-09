import { render, screen, waitFor, within } from "@testing-library/react";
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
    http.get("/api/me", () => new Promise(() => {})),
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

  /** A gaveta aberta é o diálogo (role="dialog"); no jsdom a barra lateral também está no DOM, então os links vêm dela. */
  const drawer = () => screen.getByRole("dialog", { name: "Menu" });

  it("o botão Menu abre e fecha a gaveta, refletindo o estado em aria-expanded e apontando para ela em aria-controls", async () => {
    renderAt("/dashboard");
    const user = userEvent.setup();

    const toggle = await screen.findByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(drawer()).toHaveAttribute("id", toggle.getAttribute("aria-controls"));
    expect(within(drawer()).getByRole("link", { name: "Clientes" })).toBeVisible();

    await user.click(within(drawer()).getByRole("button", { name: "Fechar" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fecha o menu com Esc e devolve o foco ao botão Menu", async () => {
    renderAt("/dashboard");
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Menu" });
    await user.click(toggle);

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it("fecha o menu ao escolher uma tela", async () => {
    renderAt("/dashboard");
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Menu" });
    await user.click(toggle);

    await user.click(within(drawer()).getByRole("link", { name: "Clientes" }));

    expect(await screen.findByRole("heading", { name: "Clientes", level: 1 })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("gaveta como diálogo modal (gestão de foco)", () => {
    async function openDrawer() {
      renderAt("/dashboard");
      const user = userEvent.setup();
      const toggle = await screen.findByRole("button", { name: "Menu" });
      await user.click(toggle);
      return { user, toggle, panel: drawer() };
    }

    it("aberta, é um diálogo modal nomeado, com a navegação e a conta, e o foco entra nela", async () => {
      const { panel } = await openDrawer();

      expect(panel).toHaveAttribute("aria-modal", "true");
      expect(panel).toHaveAccessibleName("Menu");
      expect(within(panel).getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
      expect(within(panel).getByRole("link", { name: "Minha conta" })).toBeInTheDocument();
      expect(within(panel).getByRole("button", { name: "Sair" })).toBeInTheDocument();
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    it("fechada (ou no desktop, onde é a barra lateral) não há diálogo nem o foco é roubado", async () => {
      renderAt("/dashboard");
      const toggle = await screen.findByRole("button", { name: "Menu" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(toggle).not.toHaveFocus();
      expect(document.body.contains(document.activeElement) && document.activeElement !== document.body).toBe(false);
    });

    it("o Tab fica preso na gaveta: do último item volta ao primeiro, e o Shift+Tab faz o inverso", async () => {
      const { user, panel } = await openDrawer();
      const items = within(panel).getAllByRole("link").concat(within(panel).getAllByRole("button"));
      const sorted = items.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      last.focus();
      await user.tab();
      expect(first).toHaveFocus();

      await user.tab({ shift: true });
      expect(last).toHaveFocus();
    });

    it("fechar pelo fundo escurecido devolve o foco ao botão Menu", async () => {
      const { user, toggle, panel } = await openDrawer();

      await user.click(panel.parentElement as HTMLElement);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(toggle).toHaveFocus());
    });

    it("escolher uma tela não perde o foco: ele vai ao conteúdo da nova tela, não some com a gaveta", async () => {
      const { user, panel } = await openDrawer();

      await user.click(within(panel).getByRole("link", { name: "Clientes" }));

      expect(await screen.findByRole("heading", { name: "Clientes", level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveFocus();
    });
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
    renderAt("/agenda");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Agenda", level: 1 });

    await user.click(
      within(screen.getByRole("navigation", { name: "Navegação inferior" })).getByRole("link", {
        name: "FitPoints",
      }),
    );

    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    expect(screen.getByRole("main")).toHaveAttribute("data-screen", "fitpoints");
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

  it("/plano leva ao Perfil, onde o plano agora vive", async () => {
    mockSession("Cliente", []);
    renderAt("/plano");

    await screen.findByRole("heading", { name: "Perfil", level: 1 });
  });

  it("o main do cliente também é o alvo do salto", async () => {
    mockSession("Cliente", []);
    renderAt("/agenda");

    await screen.findByRole("heading", { name: "Agenda", level: 1 });

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
