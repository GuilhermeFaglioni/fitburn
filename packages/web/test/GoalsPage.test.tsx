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
  type ClientSummary,
  type EffectivePermission,
  type GoalDetail,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { GoalsPage } from "../src/pages/GoalsPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const MARINA: ClientSummary = {
  id: "c-marina",
  fullName: "Marina Souza",
  email: "marina@email.com",
};
const CAMILA: ClientSummary = {
  id: "c-camila",
  fullName: "Camila Ferreira",
  email: "camila@email.com",
};
const JULIANA: ClientSummary = {
  id: "c-juliana",
  fullName: "Juliana Prado",
  email: "juliana@email.com",
};

function goal(id: string, overrides: Partial<GoalDetail> = {}): GoalDetail {
  return {
    id,
    clientId: MARINA.id,
    title: "Frequentar 12 aulas no mês",
    description: null,
    dueDate: null,
    status: "ACTIVE",
    concludedAt: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("rafael@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <GoalsPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/metas"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Metas individuais (professor)", () => {
  let goals: GoalDetail[];
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  beforeEach(() => {
    goals = [
      goal("g-1", { title: "Frequentar 12 aulas no mês", dueDate: "2026-09-30" }),
      goal("g-2", {
        title: "Experimentar 3 modalidades diferentes",
        status: "COMPLETED",
        concludedAt: "2026-09-02T15:00:00.000Z",
      }),
    ];
    calls.length = 0;
    mockSuccessfulLogin("Professor", [
      {
        module: Module.GAMIFICACAO,
        actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ]);
    server.use(
      http.get("/api/goals/clients", () => HttpResponse.json([CAMILA, JULIANA, MARINA])),
      http.get("/api/goals", ({ request }) => {
        const clientId = new URL(request.url).searchParams.get("clientId");
        return HttpResponse.json(goals.filter((item) => item.clientId === clientId));
      }),
      http.post("/api/goals", async ({ request }) => {
        const body = (await request.json()) as {
          clientId: string;
          title: string;
          description?: string;
          dueDate?: string;
        };
        calls.push({ method: "POST", path: "/api/goals", body });
        const created = goal(`g-${goals.length + 1}`, {
          clientId: body.clientId,
          title: body.title,
          description: body.description ?? null,
          dueDate: body.dueDate ?? null,
        });
        goals.push(created);
        return HttpResponse.json(created, { status: 201 });
      }),
      http.patch("/api/goals/:id", async ({ params, request }) => {
        const body = (await request.json()) as Partial<GoalDetail>;
        calls.push({ method: "PATCH", path: `/api/goals/${String(params.id)}`, body });
        goals = goals.map((item) => (item.id === params.id ? { ...item, ...body } : item));
        return HttpResponse.json(goals.find((item) => item.id === params.id));
      }),
      http.post("/api/goals/:id/complete", ({ params }) => {
        calls.push({ method: "POST", path: `/api/goals/${String(params.id)}/complete` });
        goals = goals.map((item) =>
          item.id === params.id
            ? { ...item, status: "COMPLETED", concludedAt: "2026-09-10T15:00:00.000Z" }
            : item,
        );
        return HttpResponse.json(goals.find((item) => item.id === params.id));
      }),
      http.post("/api/goals/:id/cancel", ({ params }) => {
        calls.push({ method: "POST", path: `/api/goals/${String(params.id)}/cancel` });
        goals = goals.map((item) =>
          item.id === params.id ? { ...item, status: "CANCELLED" } : item,
        );
        return HttpResponse.json(goals.find((item) => item.id === params.id));
      }),
    );
  });

  async function openMarina() {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Marina Souza" }));
    await screen.findByText("Frequentar 12 aulas no mês");
    return user;
  }

  /** As ações da meta ficam num menu de "⋯" (o cartão do artboard não tem botões). */
  async function pickAction(
    user: ReturnType<typeof userEvent.setup>,
    goalTitle: string,
    action: "Concluir" | "Editar" | "Cancelar meta",
  ) {
    await user.click(
      within(card(goalTitle)).getByRole("button", { name: `Ações da meta ${goalTitle}` }),
    );
    await user.click(within(card(goalTitle)).getByRole("menuitem", { name: action }));
  }

  function card(title: string) {
    return screen.getByText(title).closest("li")!;
  }

  it("lista os alunos do professor, com busca, e pede para escolher um", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("Selecione um aluno para ver e criar metas."),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Meus alunos" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Camila Ferreira", "Juliana Prado", "Marina Souza"]);

    await user.type(screen.getByRole("searchbox", { name: "Buscar aluno" }), "mar");

    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Marina Souza"]);
  });

  it("mostra as metas do aluno: ativa com prazo e concluída com a data, esmaecida", async () => {
    await openMarina();

    expect(screen.getByText("Metas / Marina Souza")).toBeInTheDocument();
    expect(
      within(card("Frequentar 12 aulas no mês")).getByText("Prazo: 30/09/2026"),
    ).toBeInTheDocument();
    const done = card("Experimentar 3 modalidades diferentes");
    expect(within(done).getByText("CONCLUÍDA")).toBeInTheDocument();
    expect(within(done).getByText("Concluída em 02/09/2026")).toBeInTheDocument();
    expect(within(done).queryByRole("button", { name: /Ações da meta/ })).not.toBeInTheDocument();
  });

  it("aluno sem metas mostra o estado vazio", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Juliana Prado" }));

    expect(await screen.findByText("Este aluno ainda não tem metas.")).toBeInTheDocument();
  });

  it("cria uma meta com título, descrição e prazo", async () => {
    const user = await openMarina();

    await user.type(screen.getByLabelText("Título"), "Treinar 4x por semana");
    await user.type(screen.getByLabelText("Descrição"), "Sem faltar");
    await user.type(screen.getByLabelText("Prazo"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Criar meta" }));

    expect(await screen.findByText("Treinar 4x por semana")).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/goals",
        body: {
          clientId: "c-marina",
          title: "Treinar 4x por semana",
          description: "Sem faltar",
          dueDate: "2026-10-05",
        },
      },
    ]);
    expect(screen.getByLabelText("Título")).toHaveValue("");
  });

  it("o botão Criar meta só fica ativo com um título", async () => {
    await openMarina();

    expect(screen.getByRole("button", { name: "Criar meta" })).toBeDisabled();
  });

  it("edita uma meta ativa pelo mesmo formulário", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Editar");
    expect(screen.getByLabelText("Título")).toHaveValue("Frequentar 12 aulas no mês");
    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Frequentar 10 aulas no mês");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Frequentar 10 aulas no mês")).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/api/goals/g-1",
        body: { title: "Frequentar 10 aulas no mês", description: null, dueDate: "2026-09-30" },
      },
    ]);
    expect(screen.getByRole("button", { name: "Criar meta" })).toBeInTheDocument();
  });

  it("conclui uma meta depois de confirmar, e ela passa a concluída", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
    expect(calls).toEqual([]);
    expect(screen.getByText("Concluir a meta e dar os pontos ao aluno?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(within(card("Frequentar 12 aulas no mês")).getByText("CONCLUÍDA")).toBeInTheDocument(),
    );
    expect(calls).toEqual([{ method: "POST", path: "/api/goals/g-1/complete" }]);
  });

  it("voltar na confirmação não conclui a meta", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(calls).toEqual([]);
    expect(screen.queryByText("Concluir a meta e dar os pontos ao aluno?")).not.toBeInTheDocument();
  });

  it("cancela uma meta ativa depois de confirmar", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Cancelar meta");
    expect(calls).toEqual([]);
    expect(
      screen.getByText("Cancelar esta meta? Ela não poderá ser reativada."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(within(card("Frequentar 12 aulas no mês")).getByText("CANCELADA")).toBeInTheDocument(),
    );
    expect(calls).toEqual([{ method: "POST", path: "/api/goals/g-1/cancel" }]);
  });

  it("o botão Cancelar do formulário limpa o que foi digitado", async () => {
    const user = await openMarina();
    await user.type(screen.getByLabelText("Título"), "Rascunho");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByLabelText("Título")).toHaveValue("");
  });

  it("a administração, com acesso a todos os clientes, vê a lista como de todos os alunos", async () => {
    mockSuccessfulLogin("Administrador");

    renderPage();

    expect(await screen.findByText("TODOS OS ALUNOS")).toBeInTheDocument();
    expect(screen.getByText("Você tem acesso a todos os clientes ativos.")).toBeInTheDocument();
  });

  it("mostra o motivo quando a API recusa a conclusão", async () => {
    server.use(
      http.post("/api/goals/:id/complete", () =>
        HttpResponse.json(
          {
            code: "GOAL_ALREADY_CONCLUDED",
            message: "Esta meta já foi concluída e não pode mais ser alterada.",
          },
          { status: 409 },
        ),
      ),
    );
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta meta já foi concluída e não pode mais ser alterada.",
    );
  });

  it("sem permissão de editar, Concluir, Editar e Cancelar meta ficam bloqueados; sem criar, o formulário também", async () => {
    const viewOnly: EffectivePermission[] = [
      {
        module: Module.GAMIFICACAO,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ];
    mockSuccessfulLogin("Professor", viewOnly);
    await openMarina();
    const active = card("Frequentar 12 aulas no mês");

    const user = userEvent.setup();
    await user.click(
      within(active).getByRole("button", { name: "Ações da meta Frequentar 12 aulas no mês" }),
    );
    for (const name of ["Concluir", "Editar", "Cancelar meta"]) {
      expect(within(active).getByRole("menuitem", { name })).toBeDisabled();
    }
    await user.type(screen.getByLabelText("Título"), "Meta");
    expect(screen.getByRole("button", { name: "Criar meta" })).toBeDisabled();
  });

  it("professor sem alunos vinculados vê o estado vazio", async () => {
    server.use(http.get("/api/goals/clients", () => HttpResponse.json([])));

    renderPage();

    expect(await screen.findByText("Você ainda não tem alunos vinculados.")).toBeInTheDocument();
  });

  it("avisa quando os alunos não carregam", async () => {
    server.use(
      http.get("/api/goals/clients", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os alunos.",
    );
  });
});
