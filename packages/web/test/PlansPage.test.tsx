import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type PlanAssignment,
  type PlanAssignmentOptions,
  type PlanDetail,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { PlansPage } from "../src/pages/PlansPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

function plan(id: string, name: string, overrides: Partial<PlanDetail> = {}): PlanDetail {
  return { id, name, description: null, isActive: true, activeClientCount: 0, ...overrides };
}

const OPTIONS: PlanAssignmentOptions = {
  plans: [
    { id: "p-performance", name: "Plano Performance" },
    { id: "p-essencial", name: "Plano Essencial" },
  ],
  clients: [
    {
      id: "c-bruno",
      fullName: "Bruno Lima",
      email: "bruno@email.com",
      activePlan: null,
    },
    {
      id: "c-marina",
      fullName: "Marina Souza",
      email: "marina@email.com",
      activePlan: { name: "Plano Performance", endDate: "2026-11-15" },
    },
  ],
};

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <PlansPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/planos"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Planos (administração)", () => {
  let plans: PlanDetail[];
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  beforeEach(() => {
    plans = [
      plan("p-performance", "Plano Performance", {
        description: "Acesso ilimitado",
        activeClientCount: 3,
      }),
      plan("p-old", "Plano Antigo", { isActive: false }),
    ];
    calls.length = 0;
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/plans", () => HttpResponse.json(plans)),
      http.get("/api/plans/options", () => HttpResponse.json(OPTIONS)),
      http.post("/api/plans", async ({ request }) => {
        const body = (await request.json()) as { name: string; description?: string };
        calls.push({ method: "POST", path: "/api/plans", body });
        const created = plan(`p-${plans.length + 1}`, body.name, {
          description: body.description ?? null,
        });
        plans.push(created);
        return HttpResponse.json(created, { status: 201 });
      }),
      http.patch("/api/plans/:id", async ({ params, request }) => {
        const body = (await request.json()) as Partial<PlanDetail>;
        calls.push({ method: "PATCH", path: `/api/plans/${String(params.id)}`, body });
        plans = plans.map((item) => (item.id === params.id ? { ...item, ...body } : item));
        return HttpResponse.json(plans.find((item) => item.id === params.id));
      }),
      http.post("/api/plans/:id/:action", ({ params }) => {
        calls.push({
          method: "POST",
          path: `/api/plans/${String(params.id)}/${String(params.action)}`,
        });
        plans = plans.map((item) =>
          item.id === params.id ? { ...item, isActive: params.action === "activate" } : item,
        );
        return HttpResponse.json(plans.find((item) => item.id === params.id));
      }),
      http.get("/api/plan-assignments", () => HttpResponse.json([])),
      http.post("/api/plan-assignments", async ({ request }) => {
        calls.push({ method: "POST", path: "/api/plan-assignments", body: await request.json() });
        return HttpResponse.json(
          {
            id: "a-1",
            plan: { id: "p-performance", name: "Plano Performance", description: null },
            startDate: "2026-10-01",
            endDate: "2026-12-31",
            status: "ACTIVE",
          } satisfies PlanAssignment,
          { status: 201 },
        );
      }),
    );
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    setBrowserOnline(true);
  });

  function row(name: string) {
    return screen.getByText(name, { selector: "td" }).closest("tr")!;
  }

  async function expectOfflineState() {
    const offline = await waitFor(() => {
      const found = document.querySelector('[data-state="offline"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }

  describe("Página", () => {
    it("o título vem do cabeçalho da base e as seções são um controle segmentado com aria-pressed", async () => {
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByRole("heading", { level: 1, name: "Planos" })).toBeInTheDocument();
      const sections = screen.getByRole("group", { name: "Seção de planos" });
      const catalog = within(sections).getByRole("button", { name: "Catálogo de planos" });
      const assign = within(sections).getByRole("button", { name: "Atribuir a cliente" });
      expect(catalog).toHaveAttribute("aria-pressed", "true");
      expect(assign).toHaveAttribute("aria-pressed", "false");

      await user.click(assign);

      expect(assign).toHaveAttribute("aria-pressed", "true");
      expect(catalog).toHaveAttribute("aria-pressed", "false");
      expect(await screen.findByLabelText("Cliente")).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "Catálogo de planos" })).not.toBeInTheDocument();

      await user.click(catalog);

      expect(await screen.findByRole("table", { name: "Catálogo de planos" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Cliente")).not.toBeInTheDocument();
    });

    it("o + Novo plano só existe no catálogo", async () => {
      const user = userEvent.setup();
      renderPage();
      expect(await screen.findByRole("button", { name: "+ Novo plano" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Atribuir a cliente" }));

      expect(screen.queryByRole("button", { name: "+ Novo plano" })).not.toBeInTheDocument();
    });

    it("títulos em ordem: h1 e, na atribuição, h2 sem salto", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole("table", { name: "Catálogo de planos" });
      expect(screen.getAllByRole("heading").map((heading) => heading.tagName)).toEqual(["H1"]);

      await user.click(screen.getByRole("button", { name: "Atribuir a cliente" }));
      await screen.findByLabelText("Cliente");

      expect(screen.getAllByRole("heading").map((heading) => [heading.tagName, heading.textContent])).toEqual([
        ["H1", "Planos"],
        ["H2", "Atribuir a cliente"],
      ]);
    });
  });

  describe("Catálogo", () => {
    it("lista os planos com descrição, situação e quantos clientes o têm ativo", async () => {
      renderPage();

      const table = await screen.findByRole("table", { name: "Catálogo de planos" });
      expect(
        within(table).getAllByRole("columnheader").map((header) => header.textContent),
      ).toEqual(["Nome", "Descrição", "Status", "Clientes ativos", "Ações"]);
      const active = row("Plano Performance");
      expect(within(active).getByText("Acesso ilimitado")).toBeInTheDocument();
      expect(within(active).getByText("ATIVO")).toBeInTheDocument();
      expect(within(active).getByText("3")).toBeInTheDocument();
      const inactive = row("Plano Antigo");
      expect(within(inactive).getByText("INATIVO")).toBeInTheDocument();
      // Sem descrição: travessão, não célula em branco.
      expect(within(inactive).getByText("—")).toBeInTheDocument();
    });

    it("os botões de ação dizem de qual plano são", async () => {
      renderPage();
      await screen.findByText("Plano Performance");

      expect(
        within(row("Plano Performance")).getByRole("button", { name: "Editar plano Plano Performance" }),
      ).toBeInTheDocument();
      expect(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar plano Plano Performance" }),
      ).toBeInTheDocument();
      expect(
        within(row("Plano Antigo")).getByRole("button", { name: "Editar plano Plano Antigo" }),
      ).toBeInTheDocument();
      expect(
        within(row("Plano Antigo")).getByRole("button", { name: "Ativar plano Plano Antigo" }),
      ).toBeInTheDocument();
    });

    it("cria um plano com nome e descrição", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(screen.getByRole("button", { name: "+ Novo plano" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Nome"), "Plano Essencial");
      await user.type(within(dialog).getByLabelText("Descrição"), "Três modalidades");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText("Plano Essencial")).toBeInTheDocument();
      expect(calls).toEqual([
        {
          method: "POST",
          path: "/api/plans",
          body: { name: "Plano Essencial", description: "Três modalidades" },
        },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("edita um plano", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(
        within(row("Plano Performance")).getByRole("button", { name: "Editar plano Plano Performance" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Editar plano" });
      expect(within(dialog).getByLabelText("Nome")).toHaveValue("Plano Performance");
      await user.clear(within(dialog).getByLabelText("Nome"));
      await user.type(within(dialog).getByLabelText("Nome"), "Plano Performance Plus");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText("Plano Performance Plus")).toBeInTheDocument();
      expect(calls).toEqual([
        {
          method: "PATCH",
          path: "/api/plans/p-performance",
          body: { name: "Plano Performance Plus", description: "Acesso ilimitado" },
        },
      ]);
    });

    it("desativar pede confirmação: nada é enviado antes, e Cancelar deixa tudo como estava", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar plano Plano Performance" }),
      );

      const dialog = screen.getByRole("dialog", { name: "Desativar o plano Plano Performance?" });
      expect(dialog).toHaveAccessibleDescription(/deixa de poder ser atribuído a novos clientes/);
      expect(calls).toEqual([]);
      // O foco inicial fica na saída segura.
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();

      await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls).toEqual([]);
      expect(within(row("Plano Performance")).getByText("ATIVO")).toBeInTheDocument();
    });

    it("confirma a desativação e a reativação: envia, atualiza a linha e fecha o diálogo", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar plano Plano Performance" }),
      );
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar desativação" }),
      );
      await waitFor(() =>
        expect(within(row("Plano Performance")).getByText("INATIVO")).toBeInTheDocument(),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(
        within(row("Plano Antigo")).getByRole("button", { name: "Ativar plano Plano Antigo" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Ativar o plano Plano Antigo?" });
      expect(dialog).toHaveAccessibleDescription("O plano volta a poder ser atribuído a clientes.");
      await user.click(within(dialog).getByRole("button", { name: "Confirmar ativação" }));
      await waitFor(() =>
        expect(within(row("Plano Antigo")).getByText("ATIVO")).toBeInTheDocument(),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      expect(calls).toEqual([
        { method: "POST", path: "/api/plans/p-performance/deactivate" },
        { method: "POST", path: "/api/plans/p-old/activate" },
      ]);
    });

    it("a recusa da API aparece dentro do diálogo, que continua aberto, e a linha não muda", async () => {
      server.use(
        http.post("/api/plans/:id/:action", () =>
          HttpResponse.json(
            { code: "FORBIDDEN", message: "Este plano não pode ser alterado agora." },
            { status: 409 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar plano Plano Performance" }),
      );
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Confirmar desativação" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Este plano não pode ser alterado agora.",
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(within(row("Plano Performance")).getByText("ATIVO")).toBeInTheDocument();
      // O botão volta a responder (não fica preso em "carregando").
      expect(within(dialog).getByRole("button", { name: "Confirmar desativação" })).not.toHaveAttribute(
        "aria-busy",
      );
    });

    it("Escape fecha a confirmação sem enviar nada", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");
      await user.click(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar plano Plano Performance" }),
      );

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls).toEqual([]);
    });

    it("criar sem nome mostra o erro no campo (aria-invalid e aria-describedby), sem enviar, e some ao corrigir", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");
      await user.click(screen.getByRole("button", { name: "+ Novo plano" }));
      const dialog = screen.getByRole("dialog", { name: "Novo plano" });

      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      const name = within(dialog).getByLabelText("Nome");
      expect(name).toHaveAttribute("aria-invalid", "true");
      const message = within(dialog).getByRole("alert");
      expect(message).toHaveTextContent("O nome do plano é obrigatório.");
      expect(name).toHaveAccessibleDescription("O nome do plano é obrigatório.");
      expect(name.getAttribute("aria-describedby")).toBe(message.id);
      expect(within(dialog).getByLabelText("Descrição")).not.toHaveAttribute("aria-invalid", "true");
      expect(calls).toEqual([]);

      await user.type(name, "Plano Essencial");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText("Plano Essencial", { selector: "td" })).toBeInTheDocument();
      expect(calls).toHaveLength(1);
    });

    it("recusa no campo um nome acima de 80 caracteres e uma descrição acima de 500", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");
      await user.click(screen.getByRole("button", { name: "+ Novo plano" }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByLabelText("Nome"));
      await user.paste("a".repeat(81));
      await user.click(within(dialog).getByLabelText("Descrição"));
      await user.paste("b".repeat(501));

      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(within(dialog).getByLabelText("Nome")).toHaveAccessibleDescription(
        "O nome pode ter no máximo 80 caracteres.",
      );
      expect(within(dialog).getByLabelText("Descrição")).toHaveAccessibleDescription(
        "A descrição pode ter no máximo 500 caracteres.",
      );
      expect(calls).toEqual([]);
    });

    it("mostra o motivo quando a API recusa o nome", async () => {
      server.use(
        http.post("/api/plans", () =>
          HttpResponse.json(
            { code: "VALIDATION_ERROR", message: "Já existe um plano com este nome." },
            { status: 400 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(screen.getByRole("button", { name: "+ Novo plano" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Nome"), "Plano Performance");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Já existe um plano com este nome.",
      );
    });

    it("catálogo vazio mostra o estado vazio", async () => {
      plans = [];

      renderPage();

      expect(await screen.findByText("Nenhum plano cadastrado.")).toBeInTheDocument();
    });

    it("sem permissão de criar e editar, os botões ficam bloqueados", async () => {
      mockSuccessfulLogin("Professor", [
        {
          module: Module.PLANOS,
          actions: [PermissionAction.VIEW],
          scope: PermissionScope.ALL,
        },
      ]);
      renderPage();
      await screen.findByText("Plano Performance");

      expect(screen.getByRole("button", { name: "+ Novo plano" })).toBeDisabled();
      expect(
        within(row("Plano Performance")).getByRole("button", { name: "Editar plano Plano Performance" }),
      ).toBeDisabled();
      expect(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar plano Plano Performance" }),
      ).toBeDisabled();
    });

    it("carregando: mostra o estado de carregamento até a lista chegar", async () => {
      server.use(
        http.get("/api/plans", async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return HttpResponse.json(plans);
        }),
      );
      renderPage();

      expect(await screen.findByText("Carregando planos…")).toBeInTheDocument();
      expect(await screen.findByText("Plano Performance")).toBeInTheDocument();
      expect(screen.queryByText("Carregando planos…")).not.toBeInTheDocument();
    });

    it("erro: mostra a mensagem com tentar de novo, que recarrega a lista", async () => {
      let calls = 0;
      server.use(
        http.get("/api/plans", () => {
          calls += 1;
          return calls === 1
            ? HttpResponse.json({ message: "falha" }, { status: 500 })
            : HttpResponse.json(plans);
        }),
      );
      const user = userEvent.setup();
      renderPage();

      const error = await screen.findByRole("alert");
      expect(error).toHaveTextContent("Não foi possível carregar os planos.");
      await user.click(within(error).getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByText("Plano Performance")).toBeInTheDocument();
    });

    it("offline: mostra o estado sem conexão (não um erro) e a tabela volta com a rede", async () => {
      onlineManager.setOnline(false);
      setBrowserOnline(false);
      renderPage();

      await expectOfflineState();
      onlineManager.setOnline(true);
      setBrowserOnline(true);

      expect(await screen.findByRole("table", { name: "Catálogo de planos" })).toBeInTheDocument();
    });
  });

  describe("Atribuir a cliente", () => {
    async function openAssign() {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");
      await user.click(screen.getByRole("button", { name: "Atribuir a cliente" }));
      await screen.findByLabelText("Cliente");
      return user;
    }

    it("mostra, em cada cliente, se ele já tem um plano ativo", async () => {
      await openAssign();

      const choices = within(screen.getByLabelText("Cliente"))
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(choices).toEqual([
        "Selecione um cliente",
        "Bruno Lima (sem plano ativo)",
        "Marina Souza (plano ativo)",
      ]);
      expect(
        within(screen.getByLabelText("Plano"))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Selecione um plano", "Plano Performance", "Plano Essencial"]);
    });

    it("avisa antes de confirmar que o cliente já tem um plano ativo, que será substituído", async () => {
      const user = await openAssign();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Marina Souza (plano ativo)");

      const warning = screen.getByRole("note");
      expect(warning).toHaveTextContent("Marina Souza já possui um plano ativo");
      expect(warning).toHaveTextContent("Plano Performance, até 15/11/2026");
      expect(warning).toHaveTextContent("na véspera do início do novo plano");
      expect(warning).toHaveTextContent("mantém o término atual");
      expect(warning).not.toHaveTextContent("imediatamente");
      expect(
        screen.getByRole("button", { name: "Encerrar atual e atribuir" }),
      ).toBeInTheDocument();
    });

    it("cliente sem plano ativo: sem aviso e com o botão Atribuir plano", async () => {
      const user = await openAssign();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");

      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Atribuir plano" })).toBeInTheDocument();
    });

    it("atribui o plano com as datas e confirma", async () => {
      const user = await openAssign();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");
      await user.selectOptions(screen.getByLabelText("Plano"), "Plano Performance");
      await user.type(screen.getByLabelText("Início"), "2026-10-01");
      await user.type(screen.getByLabelText("Término"), "2026-12-31");
      await user.click(screen.getByRole("button", { name: "Atribuir plano" }));

      expect(await screen.findByText("Plano atribuído a Bruno Lima.")).toBeInTheDocument();
      expect(calls).toEqual([
        {
          method: "POST",
          path: "/api/plan-assignments",
          body: {
            clientId: "c-bruno",
            planId: "p-performance",
            startDate: "2026-10-01",
            endDate: "2026-12-31",
          },
        },
      ]);
    });

    it("o botão só fica ativo com cliente, plano e as duas datas", async () => {
      const user = await openAssign();
      expect(screen.getByRole("button", { name: "Atribuir plano" })).toBeDisabled();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");
      await user.selectOptions(screen.getByLabelText("Plano"), "Plano Performance");
      await user.type(screen.getByLabelText("Início"), "2026-10-01");
      expect(screen.getByRole("button", { name: "Atribuir plano" })).toBeDisabled();

      await user.type(screen.getByLabelText("Término"), "2026-12-31");
      expect(screen.getByRole("button", { name: "Atribuir plano" })).toBeEnabled();
    });

    it("recusa no cliente um término anterior ao início, com o motivo, sem enviar", async () => {
      const user = await openAssign();
      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");
      await user.selectOptions(screen.getByLabelText("Plano"), "Plano Performance");
      await user.type(screen.getByLabelText("Início"), "2026-12-31");
      await user.type(screen.getByLabelText("Término"), "2026-10-01");

      expect(screen.getByRole("alert")).toHaveTextContent(
        "A data de término não pode ser anterior à de início.",
      );
      const button = screen.getByRole("button", { name: "Atribuir plano" });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(calls).toEqual([]);

      await user.clear(screen.getByLabelText("Término"));
      await user.type(screen.getByLabelText("Término"), "2027-01-31");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Atribuir plano" })).toBeEnabled();
    });

    it("mostra o motivo quando a API recusa (plano inativo)", async () => {
      server.use(
        http.post("/api/plan-assignments", () =>
          HttpResponse.json(
            { code: "PLAN_INACTIVE", message: "Este plano está inativo e não pode ser atribuído." },
            { status: 422 },
          ),
        ),
      );
      const user = await openAssign();
      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");
      await user.selectOptions(screen.getByLabelText("Plano"), "Plano Essencial");
      await user.type(screen.getByLabelText("Início"), "2026-10-01");
      await user.type(screen.getByLabelText("Término"), "2026-12-31");

      await user.click(screen.getByRole("button", { name: "Atribuir plano" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Este plano está inativo e não pode ser atribuído.",
      );
    });

    it("mostra o histórico de planos do cliente escolhido", async () => {
      server.use(
        http.get("/api/plan-assignments", ({ request }) => {
          expect(new URL(request.url).searchParams.get("clientId")).toBe("c-marina");
          return HttpResponse.json([
            {
              id: "a-2",
              plan: { id: "p-performance", name: "Plano Performance", description: null },
              startDate: "2026-08-15",
              endDate: "2026-11-15",
              status: "ACTIVE",
            },
            {
              id: "a-1",
              plan: { id: "p-essencial", name: "Plano Essencial", description: null },
              startDate: "2026-02-15",
              endDate: "2026-08-14",
              status: "ENDED",
            },
          ] satisfies PlanAssignment[]);
        }),
      );
      const user = await openAssign();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Marina Souza (plano ativo)");

      const history = await screen.findByRole("table", { name: "Planos de Marina Souza" });
      expect(
        within(history).getAllByRole("columnheader").map((header) => header.textContent),
      ).toEqual(["Plano", "Período", "Situação"]);
      const rows = within(history).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText("Plano Performance")).toBeInTheDocument();
      expect(within(rows[0]).getByText("15/08/2026 – 15/11/2026")).toBeInTheDocument();
      expect(within(rows[0]).getByText("ATIVO")).toBeInTheDocument();
      expect(within(rows[1]).getByText("ENCERRADO")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: "Histórico de planos do cliente" }),
      ).toBeInTheDocument();
    });

    it("cliente sem planos anteriores mostra o estado vazio no lugar da tabela", async () => {
      const user = await openAssign();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");

      expect(await screen.findByText("Este cliente ainda não tem planos.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("sem cliente escolhido não há histórico nem consulta de planos", async () => {
      await openAssign();

      expect(screen.queryByRole("heading", { name: "Histórico de planos do cliente" })).not.toBeInTheDocument();
    });

    it("erro no histórico mostra a mensagem com tentar de novo", async () => {
      server.use(
        http.get("/api/plan-assignments", () =>
          HttpResponse.json({ message: "falha" }, { status: 500 }),
        ),
      );
      const user = await openAssign();

      await user.selectOptions(screen.getByLabelText("Cliente"), "Marina Souza (plano ativo)");

      const error = await screen.findByRole("alert");
      expect(error).toHaveTextContent("Não foi possível carregar o histórico de planos.");
      expect(within(error).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    });

    it("erro ao carregar clientes e planos mostra a mensagem e não o formulário", async () => {
      server.use(
        http.get("/api/plans/options", () => HttpResponse.json({ message: "falha" }, { status: 500 })),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");
      await user.click(screen.getByRole("button", { name: "Atribuir a cliente" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível carregar os clientes e os planos.",
      );
      expect(screen.queryByLabelText("Cliente")).not.toBeInTheDocument();
    });

    it("offline ao abrir a atribuição: sem conexão, não erro; o formulário vem com a rede", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");
      onlineManager.setOnline(false);
      setBrowserOnline(false);
      await user.click(screen.getByRole("button", { name: "Atribuir a cliente" }));

      await expectOfflineState();
      onlineManager.setOnline(true);
      setBrowserOnline(true);

      expect(await screen.findByLabelText("Cliente")).toBeInTheDocument();
    });

    it("cliente, plano e datas são campos rotulados; o erro de datas liga ao Término por aria-invalid e aria-describedby", async () => {
      const user = await openAssign();
      expect(screen.getByLabelText("Cliente").tagName).toBe("SELECT");
      expect(screen.getByLabelText("Plano").tagName).toBe("SELECT");
      expect(screen.getByLabelText("Início")).toHaveAttribute("type", "date");
      expect(screen.getByLabelText("Término")).not.toHaveAttribute("aria-invalid", "true");

      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");
      await user.selectOptions(screen.getByLabelText("Plano"), "Plano Performance");
      await user.type(screen.getByLabelText("Início"), "2026-12-31");
      await user.type(screen.getByLabelText("Término"), "2026-10-01");

      const end = screen.getByLabelText("Término");
      expect(end).toHaveAttribute("aria-invalid", "true");
      expect(end).toHaveAccessibleDescription("A data de término não pode ser anterior à de início.");
      expect(screen.getByLabelText("Início")).not.toHaveAttribute("aria-invalid", "true");
    });

    it("depois de atribuir, o cartão confirma em status e o formulário volta limpo (menos o cliente)", async () => {
      const user = await openAssign();
      await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Lima (sem plano ativo)");
      await user.selectOptions(screen.getByLabelText("Plano"), "Plano Performance");
      await user.type(screen.getByLabelText("Início"), "2026-10-01");
      await user.type(screen.getByLabelText("Término"), "2026-12-31");
      await user.click(screen.getByRole("button", { name: "Atribuir plano" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Plano atribuído a Bruno Lima.");
      expect(screen.getByLabelText("Plano")).toHaveValue("");
      expect(screen.getByLabelText("Início")).toHaveValue("");
      expect(screen.getByLabelText("Cliente")).toHaveValue("c-bruno");
    });

    it("sem permissão de atribuir, o botão fica bloqueado com o motivo", async () => {
      mockSuccessfulLogin("Professor", [
        { module: Module.PLANOS, actions: [PermissionAction.VIEW], scope: PermissionScope.ALL },
      ]);
      await openAssign();

      const button = screen.getByRole("button", { name: "Atribuir plano" });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Você não tem permissão para atribuir planos.");
    });
  });
});
