import { useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
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
import { setBrowserOnline } from "./connectivity-helpers";
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

  afterEach(() => {
    onlineManager.setOnline(true);
    setBrowserOnline(true);
  });

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

  function card(title: string) {
    return screen.getByRole("heading", { name: title }).closest("li")!;
  }

  const trigger = (title: string) =>
    within(card(title)).getByRole("button", { name: `Ações da meta ${title}` });

  /** As ações da meta ficam recolhidas sob o botão "⋯": abre o menu e escolhe o item. */
  async function pickAction(
    user: ReturnType<typeof userEvent.setup>,
    goalTitle: string,
    action: "Concluir" | "Editar" | "Cancelar meta",
  ) {
    await user.click(trigger(goalTitle));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`^${action}`) }));
  }

  it("lista os alunos do professor, com busca, e pede para escolher um", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("Selecione um aluno para ver e criar metas."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Durante o piloto, não registre diagnósticos, lesões ou outros dados de saúde.",
      ),
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

    await user.clear(screen.getByRole("searchbox", { name: "Buscar aluno" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar aluno" }), "zzz");
    expect(screen.getByText("Nenhum aluno encontrado.")).toBeInTheDocument();
  });

  it("marca o aluno aberto com aria-current", async () => {
    await openMarina();

    const list = screen.getByRole("list", { name: "Meus alunos" });
    expect(within(list).getByRole("button", { current: true })).toHaveTextContent("Marina Souza");
  });

  it("os títulos seguem a ordem: tela, alunos, metas e uma meta por Card", async () => {
    await openMarina();

    expect(
      screen.getAllByRole("heading").map((heading) => [heading.tagName, heading.textContent]),
    ).toEqual([
      ["H1", "Metas individuais"],
      ["H2", "Meus alunos"],
      ["H2", "Metas de Marina Souza"],
      ["H3", "Frequentar 12 aulas no mês"],
      ["H3", "Experimentar 3 modalidades diferentes"],
    ]);
    expect(card("Frequentar 12 aulas no mês")).toHaveClass("fb-ui-card");
    expect(card("Frequentar 12 aulas no mês").closest("ul")).not.toBeNull();
  });

  it("mostra as metas do aluno: ativa com prazo e situação, concluída com a data e sem ações", async () => {
    await openMarina();

    const active = card("Frequentar 12 aulas no mês");
    expect(within(active).getByText("Prazo: 30/09/2026")).toBeInTheDocument();
    expect(within(active).getByText("ATIVA")).toBeInTheDocument();
    const done = card("Experimentar 3 modalidades diferentes");
    expect(within(done).getByText("CONCLUÍDA")).toBeInTheDocument();
    expect(within(done).getByText("Concluída em 02/09/2026")).toBeInTheDocument();
    expect(within(done).queryByRole("button", { name: /Ações da meta/ })).not.toBeInTheDocument();
  });

  it("não tem barra de progresso: a API não tem valor alvo nem progresso", async () => {
    await openMarina();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(document.querySelector(".fb-ui-meter")).toBeNull();
  });

  it("aluno sem metas mostra o estado vazio", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Juliana Prado" }));

    expect(await screen.findByText("Este aluno ainda não tem metas.")).toBeInTheDocument();
  });

  it("cria uma meta com título, descrição e prazo, em diálogo", async () => {
    const user = await openMarina();

    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));
    const dialog = screen.getByRole("dialog", { name: "Nova meta" });
    await user.type(within(dialog).getByLabelText("Título"), "Treinar 4x por semana");
    await user.type(within(dialog).getByLabelText("Descrição"), "Sem faltar");
    await user.type(within(dialog).getByLabelText("Prazo"), "2026-10-05");
    await user.click(within(dialog).getByRole("button", { name: "Criar meta" }));

    expect(await screen.findByText("Treinar 4x por semana")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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
    expect(screen.getByRole("button", { name: "+ Nova meta" })).toHaveFocus();
  });

  it("sem título, a meta não é criada: o erro aparece no campo, com aria-invalid, e o foco vai a ele", async () => {
    const user = await openMarina();
    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));

    await user.click(screen.getByRole("button", { name: "Criar meta" }));

    const title = screen.getByLabelText("Título");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("O título da meta é obrigatório.");
    expect(title).toHaveFocus();
    expect(calls).toEqual([]);
    expect(screen.getByRole("dialog", { name: "Nova meta" })).toBeInTheDocument();

    await user.type(title, "Meta nova");
    await user.click(screen.getByRole("button", { name: "Criar meta" }));

    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it("descrição acima de 500 caracteres mostra o erro no campo da descrição", async () => {
    const user = await openMarina();
    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));

    await user.type(screen.getByLabelText("Título"), "Meta");
    await user.click(screen.getByLabelText("Descrição"));
    await user.paste("x".repeat(501));
    await user.click(screen.getByRole("button", { name: "Criar meta" }));

    const description = screen.getByLabelText("Descrição");
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAccessibleDescription(
      "A descrição pode ter no máximo 500 caracteres.",
    );
    expect(screen.getByLabelText("Título")).not.toHaveAttribute("aria-invalid", "true");
    expect(calls).toEqual([]);
  });

  it("mostra o motivo no diálogo quando a API recusa a criação e mantém o que foi digitado", async () => {
    server.use(
      http.post("/api/goals", () =>
        HttpResponse.json(
          { code: "OUT_OF_SCOPE", message: "Este cliente está fora do seu escopo." },
          { status: 403 },
        ),
      ),
    );
    const user = await openMarina();
    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));

    await user.type(screen.getByLabelText("Título"), "Meta nova");
    await user.click(screen.getByRole("button", { name: "Criar meta" }));

    const dialog = screen.getByRole("dialog", { name: "Nova meta" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Este cliente está fora do seu escopo.",
    );
    expect(within(dialog).getByLabelText("Título")).toHaveValue("Meta nova");
  });

  it("Cancelar fecha o diálogo sem criar nada e devolve o foco a '+ Nova meta'", async () => {
    const user = await openMarina();
    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));
    await user.type(screen.getByLabelText("Título"), "Rascunho");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(screen.getByRole("button", { name: "+ Nova meta" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));
    expect(screen.getByLabelText("Título")).toHaveValue("");
  });

  it("edita uma meta ativa pelo mesmo formulário, em diálogo", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Editar");
    const dialog = screen.getByRole("dialog", { name: "Editar meta" });
    expect(within(dialog).getByLabelText("Título")).toHaveValue("Frequentar 12 aulas no mês");
    expect(within(dialog).getByLabelText("Prazo")).toHaveValue("2026-09-30");
    await user.clear(within(dialog).getByLabelText("Título"));
    await user.type(within(dialog).getByLabelText("Título"), "Frequentar 10 aulas no mês");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Frequentar 10 aulas no mês")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/api/goals/g-1",
        body: { title: "Frequentar 10 aulas no mês", description: null, dueDate: "2026-09-30" },
      },
    ]);
    expect(trigger("Frequentar 10 aulas no mês")).toHaveFocus();
  });

  it("conclui uma meta depois de confirmar em diálogo, e ela passa a concluída", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
    expect(calls).toEqual([]);
    const dialog = screen.getByRole("dialog", { name: "Concluir a meta Frequentar 12 aulas no mês?" });
    expect(dialog).toHaveAccessibleDescription("Concluir a meta e dar os pontos ao aluno?");
    expect(within(dialog).getByRole("button", { name: "Voltar" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Confirmar conclusão" }));

    await waitFor(() =>
      expect(within(card("Frequentar 12 aulas no mês")).getByText("CONCLUÍDA")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toEqual([{ method: "POST", path: "/api/goals/g-1/complete" }]);
    // O botão que abriu o diálogo saiu da meta: o foco vai ao título da lista, não se perde.
    expect(screen.getByRole("heading", { name: "Metas de Marina Souza" })).toHaveFocus();
  });

  it("Voltar e Escape, na confirmação, não concluem a meta", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger("Frequentar 12 aulas no mês")).toHaveFocus();

    await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("cancela uma meta ativa depois de confirmar em diálogo", async () => {
    const user = await openMarina();

    await pickAction(user, "Frequentar 12 aulas no mês", "Cancelar meta");
    expect(calls).toEqual([]);
    const dialog = screen.getByRole("dialog", { name: "Cancelar a meta Frequentar 12 aulas no mês?" });
    expect(dialog).toHaveAccessibleDescription("Cancelar esta meta? Ela não poderá ser reativada.");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() =>
      expect(within(card("Frequentar 12 aulas no mês")).getByText("CANCELADA")).toBeInTheDocument(),
    );
    expect(calls).toEqual([{ method: "POST", path: "/api/goals/g-1/cancel" }]);
  });

  describe("envio em voo (idempotência)", () => {
    /** Segura a resposta da API até o teste liberar, para o envio ficar em voo. */
    function gate() {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promise, release };
    }

    /** Dois cliques no mesmo tick: dentro de um só `act`, sem renderizar entre um e outro. */
    function clickTwice(button: HTMLElement) {
      act(() => {
        button.click();
        button.click();
      });
    }

    it.each([
      ["Concluir", "Confirmar conclusão", "complete"],
      ["Cancelar meta", "Confirmar cancelamento", "cancel"],
    ] as const)(
      "dois cliques rápidos em '%s' geram uma só chamada, e Escape não fecha o diálogo em voo",
      async (menuItem, confirm, endpoint) => {
        const held = gate();
        server.use(
          http.post(`/api/goals/:id/${endpoint}`, async ({ params }) => {
            calls.push({ method: "POST", path: `/api/goals/${String(params.id)}/${endpoint}` });
            await held.promise;
            goals = goals.map((item) =>
              item.id === params.id
                ? { ...item, status: endpoint === "complete" ? "COMPLETED" : "CANCELLED" }
                : item,
            );
            return HttpResponse.json(goals.find((item) => item.id === params.id));
          }),
        );
        const user = await openMarina();
        await pickAction(user, "Frequentar 12 aulas no mês", menuItem);
        const dialog = screen.getByRole("dialog");

        clickTwice(within(dialog).getByRole("button", { name: confirm }));

        await waitFor(() => expect(calls).toHaveLength(1));
        // Em voo: Escape, o fundo e "Voltar" não fecham o diálogo.
        await user.keyboard("{Escape}");
        fireEvent.mouseDown(dialog.parentElement!);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Voltar" })).toBeDisabled();

        held.release();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(calls).toHaveLength(1);
      },
    );

    it("se a API recusa, o diálogo continua aberto e dá para tentar de novo", async () => {
      let attempt = 0;
      server.use(
        http.post("/api/goals/:id/complete", ({ params }) => {
          attempt += 1;
          calls.push({ method: "POST", path: `/api/goals/${String(params.id)}/complete` });
          if (attempt === 1) {
            return HttpResponse.json({ code: "ERRO", message: "Falhou." }, { status: 409 });
          }
          goals = goals.map((item) =>
            item.id === params.id ? { ...item, status: "COMPLETED" } : item,
          );
          return HttpResponse.json(goals.find((item) => item.id === params.id));
        }),
      );
      const user = await openMarina();
      await pickAction(user, "Frequentar 12 aulas no mês", "Concluir");
      const dialog = screen.getByRole("dialog");

      await user.click(within(dialog).getByRole("button", { name: "Confirmar conclusão" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Falhou.");
      // Depois da recusa o envio sai de voo e o botão volta a enviar.
      await user.click(within(dialog).getByRole("button", { name: "Confirmar conclusão" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls).toHaveLength(2);
    });

    it("dois envios rápidos do formulário criam uma só meta, e Escape não fecha o diálogo em voo", async () => {
      const held = gate();
      server.use(
        http.post("/api/goals", async ({ request }) => {
          const body = (await request.json()) as { clientId: string; title: string };
          calls.push({ method: "POST", path: "/api/goals", body });
          await held.promise;
          const created = goal(`g-${goals.length + 1}`, { clientId: body.clientId, title: body.title });
          goals.push(created);
          return HttpResponse.json(created, { status: 201 });
        }),
      );
      const user = await openMarina();
      await user.click(screen.getByRole("button", { name: "+ Nova meta" }));
      await user.type(screen.getByLabelText("Título"), "Meta nova");
      const dialog = screen.getByRole("dialog", { name: "Nova meta" });

      act(() => {
        const form = within(dialog).getByRole("form", { name: "Meta" }) as HTMLFormElement;
        form.requestSubmit();
        form.requestSubmit();
      });

      await waitFor(() => expect(calls).toHaveLength(1));
      await user.keyboard("{Escape}");
      fireEvent.mouseDown(dialog.parentElement!);
      expect(screen.getByRole("dialog", { name: "Nova meta" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();

      held.release();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls).toHaveLength(1);
    });

    it("dois envios rápidos da edição salvam uma só vez", async () => {
      const held = gate();
      server.use(
        http.patch("/api/goals/:id", async ({ params, request }) => {
          const body = (await request.json()) as Partial<GoalDetail>;
          calls.push({ method: "PATCH", path: `/api/goals/${String(params.id)}`, body });
          await held.promise;
          goals = goals.map((item) => (item.id === params.id ? { ...item, ...body } : item));
          return HttpResponse.json(goals.find((item) => item.id === params.id));
        }),
      );
      const user = await openMarina();
      await pickAction(user, "Frequentar 12 aulas no mês", "Editar");
      const dialog = screen.getByRole("dialog", { name: "Editar meta" });
      await user.type(within(dialog).getByLabelText("Título"), " (ajustada)");

      act(() => {
        const form = within(dialog).getByRole("form", { name: "Meta" }) as HTMLFormElement;
        form.requestSubmit();
        form.requestSubmit();
      });

      await waitFor(() => expect(calls).toHaveLength(1));
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog", { name: "Editar meta" })).toBeInTheDocument();

      held.release();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls).toHaveLength(1);
    });

    it("com o formulário parado (sem envio), Escape ainda fecha o diálogo", async () => {
      const user = await openMarina();
      await user.click(screen.getByRole("button", { name: "+ Nova meta" }));

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls).toEqual([]);
    });
  });

  it("a administração, com acesso a todos os clientes, vê a lista como de todos os alunos", async () => {
    mockSuccessfulLogin("Administrador");

    renderPage();

    expect(await screen.findByRole("heading", { name: "Todos os alunos" })).toBeInTheDocument();
    expect(screen.getByText("Você tem acesso a todos os clientes ativos.")).toBeInTheDocument();
  });

  it("mostra o motivo dentro do diálogo quando a API recusa a conclusão, que continua aberto", async () => {
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
    await user.click(screen.getByRole("button", { name: "Confirmar conclusão" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Esta meta já foi concluída e não pode mais ser alterada.",
    );
  });

  it("sem permissão, as ações da meta ficam bloqueadas com o motivo; sem criar, '+ Nova meta' também", async () => {
    const viewOnly: EffectivePermission[] = [
      {
        module: Module.GAMIFICACAO,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ];
    mockSuccessfulLogin("Professor", viewOnly);
    const user = await openMarina();

    await user.click(trigger("Frequentar 12 aulas no mês"));
    for (const name of [/^Concluir/, /^Editar/, /^Cancelar meta/]) {
      const item = screen.getByRole("menuitem", { name });
      // aria-disabled (e não disabled): continua focável pelo teclado e o motivo é lido junto.
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAccessibleDescription("Você não tem permissão para alterar metas.");
    }
    expect(screen.getByText("Você não tem permissão para alterar metas.")).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: /^Concluir/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Nova meta" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "+ Nova meta" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("menu de ações da meta (⋯)", () => {
    const TITLE = "Frequentar 12 aulas no mês";

    it("declara aria-haspopup, aria-expanded e aria-controls, e usa roles de menu", async () => {
      const user = await openMarina();
      expect(trigger(TITLE)).toHaveAttribute("aria-haspopup", "menu");
      expect(trigger(TITLE)).toHaveAttribute("aria-expanded", "false");
      expect(trigger(TITLE)).not.toHaveAttribute("aria-controls");

      await user.click(trigger(TITLE));

      expect(trigger(TITLE)).toHaveAttribute("aria-expanded", "true");
      const menu = within(card(TITLE)).getByRole("menu", { name: `Ações da meta ${TITLE}` });
      expect(trigger(TITLE)).toHaveAttribute("aria-controls", menu.id);
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual(["Concluir", "Editar", "Cancelar meta"]);
    });

    it("cada ação tem um nome que diz a meta", async () => {
      const user = await openMarina();

      await user.click(trigger(TITLE));

      for (const name of [`Concluir meta ${TITLE}`, `Editar meta ${TITLE}`, `Cancelar meta ${TITLE}`]) {
        expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
      }
    });

    it("abre pelo teclado (Enter) com o foco no primeiro item", async () => {
      const user = await openMarina();
      trigger(TITLE).focus();

      await user.keyboard("{Enter}");

      expect(screen.getByRole("menuitem", { name: /^Concluir/ })).toHaveFocus();
    });

    it("aberto com o mouse, o foco também vai ao primeiro item", async () => {
      const user = await openMarina();

      await user.click(trigger(TITLE));

      expect(screen.getByRole("menuitem", { name: /^Concluir/ })).toHaveFocus();
    });

    it("a seta para baixo, no botão, abre o menu", async () => {
      const user = await openMarina();
      trigger(TITLE).focus();

      await user.keyboard("{ArrowDown}");

      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^Concluir/ })).toHaveFocus();
    });

    it("setas, Home e End percorrem os itens, dando a volta", async () => {
      const user = await openMarina();
      trigger(TITLE).focus();
      await user.keyboard("{Enter}");

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: /^Editar/ })).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: /^Cancelar meta/ })).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: /^Concluir/ })).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("menuitem", { name: /^Cancelar meta/ })).toHaveFocus();
      await user.keyboard("{Home}");
      expect(screen.getByRole("menuitem", { name: /^Concluir/ })).toHaveFocus();
      await user.keyboard("{End}");
      expect(screen.getByRole("menuitem", { name: /^Cancelar meta/ })).toHaveFocus();
    });

    it("Esc fecha e devolve o foco ao botão", async () => {
      const user = await openMarina();
      trigger(TITLE).focus();
      await user.keyboard("{Enter}");

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger(TITLE)).toHaveAttribute("aria-expanded", "false");
      expect(trigger(TITLE)).toHaveFocus();
    });

    it("Tab fecha o menu", async () => {
      const user = await openMarina();
      trigger(TITLE).focus();
      await user.keyboard("{Enter}");

      await user.keyboard("{Tab}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger(TITLE)).toHaveAttribute("aria-expanded", "false");
    });

    it("clicar fora fecha o menu", async () => {
      const user = await openMarina();
      await user.click(trigger(TITLE));

      await user.click(screen.getByRole("heading", { name: "Metas de Marina Souza" }));

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("escolher uma ação fecha o menu e abre o diálogo; o foco volta ao botão ao sair dele", async () => {
      const user = await openMarina();
      trigger(TITLE).focus();
      await user.keyboard("{Enter}");

      await user.keyboard("{Enter}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: `Concluir a meta ${TITLE}?` })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(trigger(TITLE)).toHaveFocus();
    });
  });

  describe("estados", () => {
    it("carregando os alunos", async () => {
      server.use(
        http.get("/api/goals/clients", async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return HttpResponse.json([MARINA]);
        }),
      );

      renderPage();

      expect(await screen.findByText("Carregando alunos…")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Marina Souza" })).toBeInTheDocument();
    });

    it("professor sem alunos vinculados vê o estado vazio", async () => {
      server.use(http.get("/api/goals/clients", () => HttpResponse.json([])));

      renderPage();

      expect(await screen.findByText("Você ainda não tem alunos vinculados.")).toBeInTheDocument();
    });

    it("avisa quando os alunos não carregam, com tentar novamente", async () => {
      server.use(
        http.get("/api/goals/clients", () =>
          HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Erro inesperado." },
            { status: 500 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderPage();

      const error = await screen.findByRole("alert");
      expect(error).toHaveTextContent("Não foi possível carregar os alunos.");
      server.use(http.get("/api/goals/clients", () => HttpResponse.json([MARINA])));
      await user.click(within(error).getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByRole("button", { name: "Marina Souza" })).toBeInTheDocument();
    });

    it("carregando e erro nas metas do aluno, com tentar novamente", async () => {
      let attempts = 0;
      server.use(
        http.get("/api/goals", async ({ request }) => {
          attempts += 1;
          await new Promise((resolve) => setTimeout(resolve, 60));
          if (attempts === 1) {
            return HttpResponse.json(
              { code: "INTERNAL_ERROR", message: "Erro inesperado." },
              { status: 500 },
            );
          }
          const clientId = new URL(request.url).searchParams.get("clientId");
          return HttpResponse.json(goals.filter((item) => item.clientId === clientId));
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Marina Souza" }));

      expect(await screen.findByText("Carregando metas…")).toBeInTheDocument();
      const error = await screen.findByRole("alert");
      expect(error).toHaveTextContent("Não foi possível carregar as metas.");
      await user.click(within(error).getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByText("Frequentar 12 aulas no mês")).toBeInTheDocument();
    });

    it("offline: mostra o estado sem conexão (não um erro) e os alunos vêm com a rede", async () => {
      onlineManager.setOnline(false);
      setBrowserOnline(false);
      renderPage();

      const offline = await waitFor(() => {
        const found = document.querySelector('[data-state="offline"]');
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      expect(offline).toHaveTextContent("Sem conexão");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      onlineManager.setOnline(true);
      setBrowserOnline(true);

      expect(await screen.findByRole("button", { name: "Marina Souza" })).toBeInTheDocument();
    });
  });
});
