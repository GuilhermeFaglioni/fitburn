import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

  function row(name: string) {
    return screen.getByText(name).closest("tr")!;
  }

  describe("Catálogo", () => {
    it("lista os planos com descrição, situação e quantos clientes o têm ativo", async () => {
      renderPage();

      const active = row(
        await screen.findByText("Plano Performance").then((el) => el.textContent!),
      );
      expect(within(active).getByText("Acesso ilimitado")).toBeInTheDocument();
      expect(within(active).getByText("ATIVO")).toBeInTheDocument();
      expect(within(active).getByText("3")).toBeInTheDocument();
      expect(within(row("Plano Antigo")).getByText("INATIVO")).toBeInTheDocument();
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

      await user.click(within(row("Plano Performance")).getByRole("button", { name: "Editar" }));
      const dialog = screen.getByRole("dialog");
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

    it("desativa um plano ativo e reativa um inativo", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Plano Performance");

      await user.click(within(row("Plano Performance")).getByRole("button", { name: "Desativar" }));
      await waitFor(() =>
        expect(within(row("Plano Performance")).getByText("INATIVO")).toBeInTheDocument(),
      );
      await user.click(within(row("Plano Antigo")).getByRole("button", { name: "Ativar" }));
      await waitFor(() =>
        expect(within(row("Plano Antigo")).getByText("ATIVO")).toBeInTheDocument(),
      );

      expect(calls).toEqual([
        { method: "POST", path: "/api/plans/p-performance/deactivate" },
        { method: "POST", path: "/api/plans/p-old/activate" },
      ]);
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
        within(row("Plano Performance")).getByRole("button", { name: "Editar" }),
      ).toBeDisabled();
      expect(
        within(row("Plano Performance")).getByRole("button", { name: "Desativar" }),
      ).toBeDisabled();
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

      const history = await screen.findByRole("region", { name: "Histórico de planos do cliente" });
      const items = within(history).getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(within(items[0]).getByText("Plano Performance")).toBeInTheDocument();
      expect(within(items[0]).getByText("15/08/2026 – 15/11/2026")).toBeInTheDocument();
      expect(within(items[0]).getByText("ATIVO")).toBeInTheDocument();
      expect(within(items[1]).getByText("ENCERRADO")).toBeInTheDocument();
    });
  });
});
