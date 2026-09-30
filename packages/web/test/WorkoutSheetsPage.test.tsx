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
  type PermissionActionName,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { WorkoutSheetsPage } from "../src/pages/WorkoutSheetsPage";
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/fichas"]}>
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

  it("lista os alunos do professor e pede para escolher um", async () => {
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
  });

  it("mostra as fichas do aluno com o status de cada uma", async () => {
    await openMarina();

    const list = screen.getByRole("list", { name: "Fichas de Marina Souza" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Fase 2")).toBeInTheDocument();
    expect(within(items[0]!).getByText("ATIVA")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Fase 1")).toBeInTheDocument();
    expect(within(items[1]!).getByText("CONCLUÍDA")).toBeInTheDocument();
  });

  it("aluno sem fichas mostra o estado vazio", async () => {
    sheets = [];
    await openMarina();

    expect(screen.getByText("Este aluno ainda não tem fichas.")).toBeInTheDocument();
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

  it("não salva sem título e ignora linhas de exercício sem nome", async () => {
    const user = await openMarina();

    expect(screen.getByRole("button", { name: "Salvar ficha" })).toBeDisabled();
    await user.type(screen.getByLabelText("Título"), "Só título");
    await user.click(screen.getByRole("button", { name: "+ Adicionar exercício" }));
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ title: "Só título", exercises: [] });
  });

  it("abre uma ficha para editar, com os exercícios na ordem", async () => {
    const user = await openMarina();

    const list = screen.getByRole("list", { name: "Fichas de Marina Souza" });
    await user.click(within(list).getAllByRole("button", { name: "Editar" })[0]!);

    expect(screen.getByRole("heading", { name: "Editar ficha — Fase 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("Fase 2");
    expect(screen.getByLabelText("Observações gerais")).toHaveValue("Aquecer antes.");
    expect(exerciseNames()).toEqual(["Agachamento livre", "Supino reto", "Prancha"]);
    expect(within(row(1)).getByLabelText("Carga")).toHaveValue("40kg");
    expect(within(row(3)).getByLabelText("Tempo")).toHaveValue("45s");
  });

  it("reordena, remove e adiciona exercícios e salva a lista inteira", async () => {
    const user = await openMarina();
    const list = screen.getByRole("list", { name: "Fichas de Marina Souza" });
    await user.click(within(list).getAllByRole("button", { name: "Editar" })[0]!);

    await user.click(within(row(3)).getByRole("button", { name: "Subir" }));
    expect(exerciseNames()).toEqual(["Agachamento livre", "Prancha", "Supino reto"]);
    await user.click(within(row(1)).getByRole("button", { name: "Descer" }));
    expect(exerciseNames()).toEqual(["Prancha", "Agachamento livre", "Supino reto"]);
    await user.click(within(row(3)).getByRole("button", { name: "Remover" }));
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

  it("o primeiro exercício não sobe e o último não desce", async () => {
    const user = await openMarina();
    const list = screen.getByRole("list", { name: "Fichas de Marina Souza" });
    await user.click(within(list).getAllByRole("button", { name: "Editar" })[0]!);

    expect(within(row(1)).getByRole("button", { name: "Subir" })).toBeDisabled();
    expect(within(row(3)).getByRole("button", { name: "Descer" })).toBeDisabled();
  });

  it("muda o status da ficha ao editar", async () => {
    const user = await openMarina();
    const list = screen.getByRole("list", { name: "Fichas de Marina Souza" });
    await user.click(within(list).getAllByRole("button", { name: "Editar" })[0]!);

    await user.selectOptions(screen.getByLabelText("Status"), "ARCHIVED");
    await user.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ status: "ARCHIVED" });
    await waitFor(() => expect(screen.getByText("ARQUIVADA")).toBeInTheDocument());
  });

  it("Nova ficha volta do modo de edição para um formulário em branco", async () => {
    const user = await openMarina();
    const list = screen.getByRole("list", { name: "Fichas de Marina Souza" });
    await user.click(within(list).getAllByRole("button", { name: "Editar" })[0]!);

    await user.click(screen.getByRole("button", { name: "+ Nova ficha (nova fase)" }));

    expect(screen.getByRole("heading", { name: "Nova ficha" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.queryByRole("group", { name: /^Exercício \d+$/ })).not.toBeInTheDocument();
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
});
