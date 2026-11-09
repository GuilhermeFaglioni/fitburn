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
  type ClientSummary,
  type PermissionActionName,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { WorkoutSheetsPage } from "../src/pages/WorkoutSheetsPage";
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

function exercise(
  id: string,
  name: string,
  fields: Partial<WorkoutSheet["exercises"][number]> = {},
) {
  return {
    id,
    name,
    sets: null,
    reps: null,
    load: null,
    duration: null,
    distance: null,
    notes: null,
    ...fields,
  };
}

function sheet(id: string, overrides: Partial<WorkoutSheet> = {}): WorkoutSheet {
  return {
    id,
    clientId: MARINA.id,
    title: "Fase 2",
    notes: null,
    status: "ACTIVE",
    authorName: "Rafael",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    exercises: [],
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
  return <WorkoutSheetsPage />;
}

function renderPage(path = "/fichas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Fichas de treino (professor)", () => {
  let sheets: WorkoutSheet[];
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  function loginAs(actions: PermissionActionName[] = Object.values(PermissionAction)) {
    mockSuccessfulLogin("Professor", [
      {
        module: Module.FICHAS_DE_TREINO,
        actions,
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ]);
  }

  afterEach(() => {
    onlineManager.setOnline(true);
    setBrowserOnline(true);
  });

  beforeEach(() => {
    sheets = [
      sheet("s-2", {
        title: "Fase 2",
        notes: "Aquecer antes.",
        exercises: [
          exercise("e-1", "Agachamento livre", {
            sets: "4",
            reps: "10",
            load: "40kg",
            notes: "Descer até 90°.",
          }),
          exercise("e-2", "Supino reto", { sets: "3", reps: "12" }),
          exercise("e-3", "Prancha", { sets: "3", duration: "45s" }),
        ],
      }),
      sheet("s-1", {
        title: "Fase 1",
        status: "COMPLETED",
        createdAt: "2026-07-01T12:00:00.000Z",
        exercises: [exercise("e-4", "Remada curvada")],
      }),
    ];
    calls.length = 0;
    loginAs();
    server.use(
      http.get("/api/workout-sheets/clients", () => HttpResponse.json([CAMILA, MARINA])),
      http.get("/api/workout-sheets", ({ request }) => {
        const clientId = new URL(request.url).searchParams.get("clientId");
        return HttpResponse.json(sheets.filter((item) => item.clientId === clientId));
      }),
      http.post("/api/workout-sheets", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown> & {
          exercises?: Array<{ name: string }>;
        };
        calls.push({ method: "POST", path: "/api/workout-sheets", body });
        const created = sheet(`s-${sheets.length + 10}`, {
          clientId: String(body.clientId),
          title: String(body.title),
          exercises: (body.exercises ?? []).map((item, index) => exercise(`n-${index}`, item.name)),
        });
        sheets = [created, ...sheets];
        return HttpResponse.json(created, { status: 201 });
      }),
      http.patch("/api/workout-sheets/:id", async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown> & {
          exercises?: Array<{ name: string }>;
        };
        calls.push({ method: "PATCH", path: `/api/workout-sheets/${String(params.id)}`, body });
        sheets = sheets.map((item) =>
          item.id === params.id
            ? {
                ...item,
                title: body.title === undefined ? item.title : String(body.title),
                status: (body.status as WorkoutSheet["status"]) ?? item.status,
                exercises: body.exercises
                  ? body.exercises.map((entry, index) => exercise(`u-${index}`, entry.name))
                  : item.exercises,
              }
            : item,
        );
        return HttpResponse.json(sheets.find((item) => item.id === params.id));
      }),
    );
  });

  it("abre já no aluno quando chega com ?cliente= (vindo da aula)", async () => {
    renderPage("/fichas?cliente=c-marina");

    expect(await screen.findByRole("heading", { name: "Nova ficha" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Fichas de Marina Souza/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Durante o piloto, não registre diagnósticos, lesões ou outros dados de saúde.",
      ),
    ).toBeInTheDocument();
  });

  it("um ?cliente= fora do escopo do professor não abre o editor de ninguém", async () => {
    renderPage("/fichas?cliente=c-fora-do-escopo");

    expect(
      await screen.findByText("Selecione um aluno para ver e montar fichas."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nova ficha" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
  });

  async function openMarina() {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Marina Souza" }));
    await screen.findByRole("heading", { name: "Nova ficha" });
    return user;
  }

  function exerciseNames(): string[] {
    return screen
      .getAllByRole("group", { name: /^Exercício \d+$/ })
      .map((group) => (within(group).getByLabelText("Exercício") as HTMLInputElement).value);
  }

  function row(position: number) {
    return screen.getByRole("group", { name: `Exercício ${position}` });
  }

  /** As linhas de dados da tabela de fichas do aluno (sem o cabeçalho). */
  function sheetRows() {
    return within(screen.getByRole("table", { name: "Fichas de Marina Souza" }))
      .getAllByRole("row")
      .slice(1);
  }

  async function editFirstSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Editar ficha Fase 2" }));
    await screen.findByRole("heading", { name: "Editar ficha — Fase 2" });
  }

  it("lista os alunos do professor, com o aluno aberto marcado, e pede para escolher um", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("Selecione um aluno para ver e montar fichas."),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Meus alunos" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Camila Ferreira", "Marina Souza"]);
    expect(within(list).queryByRole("button", { current: true })).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Marina Souza" }));

    expect(await within(list).findByRole("button", { current: true })).toHaveTextContent(
      "Marina Souza",
    );
  });

  it("busca aluno pelo nome e avisa quando ninguém bate", async () => {
    const user = userEvent.setup();
    renderPage();
    const search = await screen.findByRole("searchbox", { name: "Buscar aluno" });
    const list = () => screen.getByRole("list", { name: "Meus alunos" });

    await user.type(search, "cam");
    expect(
      within(list())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Camila Ferreira"]);

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.queryByRole("list", { name: "Meus alunos" })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum aluno encontrado.")).toBeInTheDocument();
  });

  it("os títulos seguem a ordem: tela, alunos, editor, exercícios e fichas do aluno", async () => {
    await openMarina();

    expect(
      screen.getAllByRole("heading").map((heading) => [heading.tagName, heading.textContent]),
    ).toEqual([
      ["H1", "Fichas de treino"],
      ["H2", "Meus alunos"],
      ["H2", "Nova ficha"],
      ["H3", "Exercícios"],
      ["H2", "Fichas de Marina Souza"],
    ]);
  });

  it("a administração, com acesso a todos os clientes, vê a coluna como 'Todos os alunos'", async () => {
    mockSuccessfulLogin("Administrador");

    renderPage();

    expect(await screen.findByRole("heading", { name: "Todos os alunos" })).toBeInTheDocument();
    expect(screen.getByText("Você tem acesso a todos os clientes ativos.")).toBeInTheDocument();
  });

  it("mostra as fichas do aluno com o status de cada uma", async () => {
    await openMarina();

    const items = await waitFor(() => {
      const found = sheetRows();
      expect(found).toHaveLength(2);
      return found;
    });
    expect(within(items[0]!).getByText("Fase 2")).toBeInTheDocument();
    expect(within(items[0]!).getByText("3 exercícios")).toBeInTheDocument();
    expect(within(items[0]!).getByText("ATIVA")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Fase 1")).toBeInTheDocument();
    expect(within(items[1]!).getByText("1 exercício")).toBeInTheDocument();
    expect(within(items[1]!).getByText("CONCLUÍDA")).toBeInTheDocument();
  });

  it("aluno sem fichas mostra o estado vazio", async () => {
    sheets = [];
    await openMarina();

    expect(await screen.findByText("Este aluno ainda não tem fichas.")).toBeInTheDocument();
  });

  it("editando a única ficha do aluno, ela sai da lista mas não aparece 'ainda não tem fichas'", async () => {
    sheets = [sheets[0]!];
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });

    await editFirstSheet(user);

    expect(
      screen.getByRole("heading", { name: /Fichas anteriores de Marina Souza/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Este aluno ainda não tem fichas.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar ficha/ })).not.toBeInTheDocument();
  });

  it("cria uma ficha com exercícios em linhas repetíveis, na ordem em que foram adicionados", async () => {
    const user = await openMarina();

    await user.type(screen.getByLabelText("Título"), "Fase 3");
    await user.type(screen.getByLabelText("Observações gerais"), "Foco em pernas.");
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
    await user.type(within(row(1)).getByLabelText("Exercício"), "Leg press");
    await user.type(within(row(1)).getByLabelText("Séries"), "4");
    await user.type(within(row(1)).getByLabelText("Repetições"), "12");
    await user.type(within(row(1)).getByLabelText("Carga"), "80kg");
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
    await user.type(within(row(2)).getByLabelText("Exercício"), "Esteira");
    await user.type(within(row(2)).getByLabelText("Tempo"), "10min");
    await user.type(within(row(2)).getByLabelText("Distância"), "1,5km");
    await user.type(within(row(2)).getByLabelText("Observações"), "Ritmo leve");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/workout-sheets",
      body: {
        clientId: "c-marina",
        title: "Fase 3",
        notes: "Foco em pernas.",
        status: "ACTIVE",
        exercises: [
          { name: "Leg press", sets: "4", reps: "12", load: "80kg" },
          { name: "Esteira", duration: "10min", distance: "1,5km", notes: "Ritmo leve" },
        ],
      },
    });
    expect(await screen.findByText("Fase 3")).toBeInTheDocument();
  });

  it("adicionar um exercício leva o foco ao nome dele", async () => {
    const user = await openMarina();

    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));

    expect(within(row(1)).getByLabelText("Exercício")).toHaveFocus();
  });

  it("os campos de cada exercício ficam num Card, e a lista vazia mostra o estado vazio", async () => {
    const user = await openMarina();
    expect(screen.getByText("Nenhum exercício ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /exerc/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));

    expect(screen.queryByText("Nenhum exercício ainda.")).not.toBeInTheDocument();
    const group = row(1);
    expect(group).toHaveClass("fb-ui-card");
    expect(group.closest("li")).not.toBeNull();
    for (const label of ["Exercício", "Séries", "Repetições", "Carga", "Tempo"]) {
      expect(within(group).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("sem título, não salva: o erro aparece no campo, com aria-invalid, e o foco vai a ele", async () => {
    const user = await openMarina();

    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    const title = screen.getByLabelText("Título");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("O título da ficha é obrigatório.");
    expect(screen.getByRole("alert")).toHaveTextContent("O título da ficha é obrigatório.");
    expect(title).toHaveFocus();
    expect(calls).toEqual([]);

    await user.type(title, "Fase 3");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByLabelText("Título")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("título e campos acima do limite do contrato mostram o erro no campo certo", async () => {
    const user = await openMarina();

    await user.type(screen.getByLabelText("Título"), "Fase 3");
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
    await user.type(within(row(1)).getByLabelText("Exercício"), "Prancha");
    await user.click(within(row(1)).getByLabelText("Tempo"));
    await user.paste("x".repeat(41));
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    const time = within(row(1)).getByLabelText("Tempo");
    expect(time).toHaveAttribute("aria-invalid", "true");
    expect(time).toHaveAccessibleDescription("O tempo pode ter no máximo 40 caracteres.");
    expect(time).toHaveFocus();
    expect(calls).toEqual([]);
  });

  it("ignora linhas de exercício em branco, mas não descarta em silêncio uma linha sem nome que tem dados", async () => {
    const user = await openMarina();

    await user.type(screen.getByLabelText("Título"), "Só título");
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ title: "Só título", exercises: [] });
    calls.length = 0;

    await user.click(await screen.findByRole("button", { name: "+ Adicionar exercício" }));
    await user.type(within(row(1)).getByLabelText("Séries"), "3");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    const name = within(row(1)).getByLabelText("Exercício");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Informe o nome do exercício.");
    expect(calls).toEqual([]);
  });

  it("abre uma ficha para editar, com os exercícios na ordem", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });

    await editFirstSheet(user);

    expect(screen.getByLabelText("Título")).toHaveValue("Fase 2");
    expect(screen.getByLabelText("Observações gerais")).toHaveValue("Aquecer antes.");
    expect(exerciseNames()).toEqual(["Agachamento livre", "Supino reto", "Prancha"]);
    expect(within(row(1)).getByLabelText("Carga")).toHaveValue("40kg");
    expect(within(row(3)).getByLabelText("Tempo")).toHaveValue("45s");
  });

  it("as observações com quebra de linha não perdem a quebra ao editar", async () => {
    sheets[0] = { ...sheets[0]!, notes: "Aquecer.\nAlongar no fim." };
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });

    await editFirstSheet(user);
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ notes: "Aquecer.\nAlongar no fim." });
  });

  it("reordena, remove (com confirmação) e adiciona exercícios e salva a lista inteira", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    await user.click(screen.getByRole("button", { name: "Subir exercício Prancha" }));
    expect(exerciseNames()).toEqual(["Agachamento livre", "Prancha", "Supino reto"]);
    await user.click(screen.getByRole("button", { name: "Descer exercício Agachamento livre" }));
    expect(exerciseNames()).toEqual(["Prancha", "Agachamento livre", "Supino reto"]);
    await user.click(screen.getByRole("button", { name: "Remover exercício Supino reto" }));
    await user.click(screen.getByRole("button", { name: "Remover exercício" }));
    expect(exerciseNames()).toEqual(["Prancha", "Agachamento livre"]);
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
    await user.type(within(row(3)).getByLabelText("Exercício"), "Afundo");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "PATCH", path: "/api/workout-sheets/s-2" });
    const body = calls[0]?.body as { exercises: Array<{ name: string }> };
    expect(body.exercises.map((item) => item.name)).toEqual([
      "Prancha",
      "Agachamento livre",
      "Afundo",
    ]);
  });

  it("remover pede confirmação em diálogo: cancelar e Escape mantêm o exercício", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);
    const opener = screen.getByRole("button", { name: "Remover exercício Prancha" });

    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Remover o exercício Prancha?" });
    expect(dialog).toHaveAccessibleDescription("Ele deixa a ficha quando você salvar.");
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exerciseNames()).toEqual(["Agachamento livre", "Supino reto", "Prancha"]);
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exerciseNames()).toEqual(["Agachamento livre", "Supino reto", "Prancha"]);
  });

  it("depois de remover, o foco vai para 'Adicionar exercício' (o botão da linha sumiu)", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    await user.click(screen.getByRole("button", { name: "Remover exercício Prancha" }));
    await user.click(screen.getByRole("button", { name: "Remover exercício" }));

    expect(exerciseNames()).toEqual(["Agachamento livre", "Supino reto"]);
    expect(screen.getByRole("button", { name: "+ Adicionar exercício" })).toHaveFocus();
  });

  it("remover um exercício ainda sem nome o chama pela posição", async () => {
    const user = await openMarina();
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));

    await user.click(screen.getByRole("button", { name: "Remover exercício 1" }));

    expect(screen.getByRole("dialog", { name: "Remover o exercício 1?" })).toBeInTheDocument();
  });

  it("o primeiro exercício não sobe e o último não desce (e o botão não perde o foco)", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    const up = screen.getByRole("button", { name: "Subir exercício Agachamento livre" });
    const down = screen.getByRole("button", { name: "Descer exercício Prancha" });
    expect(up).toHaveAttribute("aria-disabled", "true");
    expect(down).toHaveAttribute("aria-disabled", "true");
    await user.click(up);
    await user.click(down);
    expect(exerciseNames()).toEqual(["Agachamento livre", "Supino reto", "Prancha"]);
  });

  it("depois de subir, o foco continua no botão Subir do exercício que mudou de lugar", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    await user.click(screen.getByRole("button", { name: "Subir exercício Prancha" }));

    expect(screen.getByRole("button", { name: "Subir exercício Prancha" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(exerciseNames()).toEqual(["Prancha", "Agachamento livre", "Supino reto"]);
    expect(screen.getByRole("button", { name: "Subir exercício Prancha" })).toHaveFocus();
  });

  it("muda o status da ficha ao editar", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    await user.selectOptions(screen.getByLabelText("Status"), "ARCHIVED");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ status: "ARCHIVED" });
    await waitFor(() => expect(screen.getByText("ARQUIVADA")).toBeInTheDocument());
  });

  it("Nova ficha volta do modo de edição para um formulário em branco", async () => {
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    await user.click(screen.getByRole("button", { name: "+ Nova ficha (nova fase)" }));

    expect(screen.getByRole("heading", { name: "Nova ficha" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.queryByRole("group", { name: /^Exercício \d+$/ })).not.toBeInTheDocument();
  });

  it("Cancelar, numa ficha nova, limpa o que foi digitado", async () => {
    const user = await openMarina();
    await user.type(screen.getByLabelText("Título"), "Rascunho");
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Descartar alterações não salvas?" })).getByRole(
        "button",
        { name: "Descartar alterações" },
      ),
    );

    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.queryByRole("group", { name: /^Exercício \d+$/ })).not.toBeInTheDocument();
  });

  it("trocar de aluno não leva o rascunho de um para o outro", async () => {
    const user = await openMarina();
    await user.type(screen.getByLabelText("Título"), "Ficha da Marina");

    await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Descartar alterações não salvas?" })).getByRole(
        "button",
        { name: "Descartar alterações" },
      ),
    );

    expect(await screen.findByRole("heading", { name: /Fichas de Camila Ferreira/ })).toBeVisible();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: /Fichas de Marina Souza/ })).not.toBeInTheDocument();
  });

  describe("alterações não salvas no editor", () => {
    const DISCARD = "Descartar alterações não salvas?";
    const discardDialog = () => screen.getByRole("dialog", { name: DISCARD });
    const noDiscardDialog = () =>
      expect(screen.queryByRole("dialog", { name: DISCARD })).not.toBeInTheDocument();

    it("trocar de aluno com o editor limpo segue direto, sem diálogo", async () => {
      const user = await openMarina();

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));

      expect(await screen.findByRole("heading", { name: /Fichas de Camila Ferreira/ })).toBeVisible();
      noDiscardDialog();
    });

    it("trocar de aluno com rascunho pede confirmação, com o foco em 'Continuar editando'", async () => {
      const user = await openMarina();
      await user.type(screen.getByLabelText("Título"), "Ficha da Marina");

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));

      const dialog = discardDialog();
      expect(within(dialog).getByRole("button", { name: "Continuar editando" })).toHaveFocus();
      // Nada foi descartado enquanto o diálogo está aberto.
      expect(screen.getByLabelText("Título")).toHaveValue("Ficha da Marina");
      expect(screen.getByRole("heading", { name: /Fichas de Marina Souza/ })).toBeVisible();
    });

    it("'Continuar editando' e Escape mantêm o aluno e o que foi digitado", async () => {
      const user = await openMarina();
      await user.type(screen.getByLabelText("Título"), "Ficha da Marina");
      await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
      await user.type(screen.getByLabelText("Exercício"), "Remo");

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));
      await user.click(within(discardDialog()).getByRole("button", { name: "Continuar editando" }));
      noDiscardDialog();
      expect(screen.getByLabelText("Título")).toHaveValue("Ficha da Marina");
      expect(screen.getByLabelText("Exercício")).toHaveValue("Remo");

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));
      await user.keyboard("{Escape}");
      noDiscardDialog();
      expect(screen.getByLabelText("Título")).toHaveValue("Ficha da Marina");
      expect(screen.getByRole("heading", { name: /Fichas de Marina Souza/ })).toBeVisible();
    });

    it("em ficha nova, mudar só o status ou só adicionar um exercício em branco já conta como alteração", async () => {
      const user = await openMarina();
      await user.selectOptions(screen.getByLabelText("Status"), "ARCHIVED");
      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));
      expect(discardDialog()).toBeVisible();
      await user.click(within(discardDialog()).getByRole("button", { name: "Continuar editando" }));

      // Voltando o status ao inicial, o editor fica limpo de novo.
      await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
      await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));
      expect(discardDialog()).toBeVisible();
    });

    it("voltar ao que estava antes de digitar deixa o editor limpo", async () => {
      const user = await openMarina();
      await user.type(screen.getByLabelText("Título"), "a");
      await user.clear(screen.getByLabelText("Título"));

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));

      expect(await screen.findByRole("heading", { name: /Fichas de Camila Ferreira/ })).toBeVisible();
      noDiscardDialog();
    });

    it("Cancelar numa ficha nova limpa pede confirmação só quando há rascunho", async () => {
      const user = await openMarina();

      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      noDiscardDialog();

      await user.type(screen.getByLabelText("Observações gerais"), "Cuidado com o joelho.");
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      await user.click(within(discardDialog()).getByRole("button", { name: "Continuar editando" }));
      expect(screen.getByLabelText("Observações gerais")).toHaveValue("Cuidado com o joelho.");
    });

    it("ficha existente sem alteração: Nova ficha e Editar outra ficha seguem direto", async () => {
      const user = await openMarina();
      await screen.findByRole("table", { name: "Fichas de Marina Souza" });
      await editFirstSheet(user);

      await user.click(screen.getByRole("button", { name: "Editar ficha Fase 1" }));
      expect(await screen.findByRole("heading", { name: "Editar ficha — Fase 1" })).toBeVisible();
      noDiscardDialog();

      await user.click(screen.getByRole("button", { name: "+ Nova ficha (nova fase)" }));
      expect(screen.getByRole("heading", { name: "Nova ficha" })).toBeVisible();
      noDiscardDialog();
    });

    it("ficha existente alterada: Nova ficha e Editar outra ficha pedem confirmação", async () => {
      const user = await openMarina();
      await screen.findByRole("table", { name: "Fichas de Marina Souza" });
      await editFirstSheet(user);
      await user.type(screen.getByLabelText("Título"), " revisada");

      await user.click(screen.getByRole("button", { name: "+ Nova ficha (nova fase)" }));
      await user.click(within(discardDialog()).getByRole("button", { name: "Continuar editando" }));
      expect(screen.getByRole("heading", { name: "Editar ficha — Fase 2" })).toBeVisible();
      expect(screen.getByLabelText("Título")).toHaveValue("Fase 2 revisada");

      await user.click(screen.getByRole("button", { name: "Editar ficha Fase 1" }));
      expect(discardDialog()).toBeVisible();
      await user.click(within(discardDialog()).getByRole("button", { name: "Descartar alterações" }));
      expect(await screen.findByRole("heading", { name: "Editar ficha — Fase 1" })).toBeVisible();
      expect(screen.getByLabelText("Título")).toHaveValue("Fase 1");
    });

    it("remover ou reordenar exercício de uma ficha existente também conta como alteração", async () => {
      const user = await openMarina();
      await screen.findByRole("table", { name: "Fichas de Marina Souza" });
      await editFirstSheet(user);

      await user.click(screen.getByRole("button", { name: "Descer exercício Agachamento livre" }));
      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));
      expect(discardDialog()).toBeVisible();
    });

    it("depois de salvar com sucesso, trocar de aluno segue direto", async () => {
      const user = await openMarina();
      await user.type(screen.getByLabelText("Título"), "Fase 3");
      await user.click(screen.getByRole("button", { name: "Salvar ficha" }));
      await waitFor(() => expect(calls).toHaveLength(1));
      await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue(""));

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));

      expect(await screen.findByRole("heading", { name: /Fichas de Camila Ferreira/ })).toBeVisible();
      noDiscardDialog();
    });

    it("depois de salvar uma ficha em edição, Nova ficha e trocar de aluno seguem direto", async () => {
      const user = await openMarina();
      await screen.findByRole("table", { name: "Fichas de Marina Souza" });
      await editFirstSheet(user);
      await user.type(screen.getByLabelText("Título"), " revisada");
      await user.click(screen.getByRole("button", { name: "Salvar ficha" }));
      await waitFor(() => expect(calls).toHaveLength(1));
      await screen.findByRole("heading", { name: "Nova ficha" });

      await user.click(screen.getByRole("button", { name: "Camila Ferreira" }));

      expect(await screen.findByRole("heading", { name: /Fichas de Camila Ferreira/ })).toBeVisible();
      noDiscardDialog();
    });
  });

  it("mostra o motivo quando a API recusa o salvamento e mantém o que foi digitado", async () => {
    server.use(
      http.post("/api/workout-sheets", () =>
        HttpResponse.json(
          { code: "OUT_OF_SCOPE", message: "Este cliente está fora do seu escopo." },
          { status: 403 },
        ),
      ),
    );
    const user = await openMarina();

    await user.type(screen.getByLabelText("Título"), "Fase 3");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este cliente está fora do seu escopo.",
    );
    expect(screen.getByLabelText("Título")).toHaveValue("Fase 3");
  });

  it("sem permissão de criar, o botão de salvar uma ficha nova fica bloqueado", async () => {
    loginAs([PermissionAction.VIEW, PermissionAction.EDIT]);
    await openMarina();

    expect(screen.getByRole("button", { name: "Salvar ficha" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("sem permissão de editar, o botão de salvar uma ficha existente fica bloqueado", async () => {
    loginAs([PermissionAction.VIEW, PermissionAction.CREATE]);
    const user = await openMarina();
    await screen.findByRole("table", { name: "Fichas de Marina Souza" });
    await editFirstSheet(user);

    expect(screen.getByRole("button", { name: "Salvar ficha" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  describe("estados", () => {
    it("carregando os alunos", async () => {
      server.use(
        http.get("/api/workout-sheets/clients", async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return HttpResponse.json([MARINA]);
        }),
      );

      renderPage();

      expect(await screen.findByText("Carregando alunos…")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Marina Souza" })).toBeInTheDocument();
      expect(screen.queryByText("Carregando alunos…")).not.toBeInTheDocument();
    });

    it("erro nos alunos, com tentar novamente", async () => {
      server.use(
        http.get("/api/workout-sheets/clients", () =>
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
      server.use(http.get("/api/workout-sheets/clients", () => HttpResponse.json([MARINA])));
      await user.click(within(error).getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByRole("button", { name: "Marina Souza" })).toBeInTheDocument();
    });

    it("professor sem alunos vinculados vê o estado vazio", async () => {
      server.use(http.get("/api/workout-sheets/clients", () => HttpResponse.json([])));

      renderPage();

      expect(await screen.findByText("Você ainda não tem alunos vinculados.")).toBeInTheDocument();
    });

    it("erro nas fichas do aluno, com tentar novamente (o editor continua)", async () => {
      server.use(
        http.get("/api/workout-sheets", () =>
          HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Erro inesperado." },
            { status: 500 },
          ),
        ),
      );
      const user = await openMarina();

      const error = await screen.findByRole("alert");
      expect(error).toHaveTextContent("Não foi possível carregar as fichas.");
      expect(screen.getByLabelText("Título")).toBeInTheDocument();
      server.use(
        http.get("/api/workout-sheets", () => HttpResponse.json(sheets)),
      );
      await user.click(within(error).getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByRole("table", { name: "Fichas de Marina Souza" })).toBeVisible();
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
