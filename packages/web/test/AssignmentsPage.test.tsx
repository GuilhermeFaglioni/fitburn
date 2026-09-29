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
  type Assignment,
  type AssignmentOptions,
  type EffectivePermission,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AssignmentsPage } from "../src/pages/AssignmentsPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const RAFAEL = { id: "t-rafael", fullName: "Rafael Andrade" };
const PAULA = { id: "t-paula", fullName: "Paula Lima" };
const MARINA = { id: "c-marina", fullName: "Marina Souza", email: "marina@email.com" };
const BRUNO = { id: "c-bruno", fullName: "Bruno Alves", email: "bruno@email.com" };
const CAMILA = { id: "c-camila", fullName: "Camila Duarte", email: "camila@email.com" };

const OPTIONS: AssignmentOptions = {
  teachers: [RAFAEL, PAULA],
  clients: [BRUNO, CAMILA, MARINA],
};

function assignment(
  id: string,
  teacher: Assignment["teacher"],
  client: Assignment["client"],
): Assignment {
  return { id, teacher, client, createdAt: "2026-09-20T15:00:00.000Z" };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <AssignmentsPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/atribuicoes"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Atribuição de clientes a professores", () => {
  let assignments: Assignment[];
  const created: unknown[] = [];
  const removed: string[] = [];
  const listRequests: Array<string | null> = [];

  beforeEach(() => {
    assignments = [assignment("a-1", RAFAEL, MARINA)];
    created.length = 0;
    removed.length = 0;
    listRequests.length = 0;
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/assignments/options", () => HttpResponse.json(OPTIONS)),
      http.get("/api/assignments", ({ request }) => {
        const teacherId = new URL(request.url).searchParams.get("teacherId");
        listRequests.push(teacherId);
        return HttpResponse.json(
          assignments.filter((item) => !teacherId || item.teacher.id === teacherId),
        );
      }),
      http.post("/api/assignments", async ({ request }) => {
        const body = (await request.json()) as { teacherId: string; clientId: string };
        created.push(body);
        const teacher = OPTIONS.teachers.find((item) => item.id === body.teacherId)!;
        const client = OPTIONS.clients.find((item) => item.id === body.clientId)!;
        const next = assignment(`a-${assignments.length + 1}`, teacher, client);
        assignments.push(next);
        return HttpResponse.json(next, { status: 201 });
      }),
      http.delete("/api/assignments/:id", ({ params }) => {
        removed.push(String(params.id));
        assignments = assignments.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
  });

  async function selectTeacher(name: string) {
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Professor"), name);
    return user;
  }

  it("pede para escolher um professor e lista os clientes atribuídos a ele", async () => {
    renderPage();

    expect(
      await screen.findByText("Selecione um professor para ver os clientes atribuídos a ele."),
    ).toBeInTheDocument();
    await selectTeacher("Rafael Andrade");

    const table = await screen.findByRole("table");
    const row = within(table).getByRole("row", { name: /Marina Souza/ });
    expect(within(row).getByText("marina@email.com")).toBeInTheDocument();
    expect(within(row).getByText("20/09/2026")).toBeInTheDocument();
    expect(listRequests[listRequests.length - 1]).toBe("t-rafael");
  });

  it("professor sem clientes atribuídos mostra o estado vazio", async () => {
    renderPage();

    await selectTeacher("Paula Lima");

    expect(
      await screen.findByText("Nenhum cliente atribuído manualmente a Paula Lima."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("atribui um cliente: só os que ainda não estão atribuídos aparecem na escolha", async () => {
    renderPage();
    const user = await selectTeacher("Rafael Andrade");
    await screen.findByRole("table");

    const clientSelect = screen.getByLabelText("Cliente");
    const choices = within(clientSelect)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(choices).toEqual([
      "Selecione um cliente",
      "Bruno Alves · bruno@email.com",
      "Camila Duarte · camila@email.com",
    ]);

    await user.selectOptions(clientSelect, "Camila Duarte · camila@email.com");
    await user.click(screen.getByRole("button", { name: "Atribuir" }));

    expect(await screen.findByRole("row", { name: /Camila Duarte/ })).toBeInTheDocument();
    expect(created).toEqual([{ teacherId: "t-rafael", clientId: "c-camila" }]);
    expect(
      within(screen.getByLabelText("Cliente")).queryByRole("option", { name: /Camila Duarte/ }),
    ).toBeNull();
  });

  it("o botão Atribuir só fica ativo com um cliente escolhido", async () => {
    renderPage();
    await selectTeacher("Rafael Andrade");
    await screen.findByRole("table");

    expect(screen.getByRole("button", { name: "Atribuir" })).toBeDisabled();
  });

  it("remove uma atribuição", async () => {
    renderPage();
    const user = await selectTeacher("Rafael Andrade");
    const row = await screen.findByRole("row", { name: /Marina Souza/ });

    await user.click(within(row).getByRole("button", { name: "Remover" }));

    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /Marina Souza/ })).not.toBeInTheDocument(),
    );
    expect(removed).toEqual(["a-1"]);
    expect(
      await screen.findByText("Nenhum cliente atribuído manualmente a Rafael Andrade."),
    ).toBeInTheDocument();
  });

  it("mostra o motivo quando a API recusa a atribuição", async () => {
    server.use(
      http.post("/api/assignments", () =>
        HttpResponse.json(
          {
            code: "CLIENT_ALREADY_ASSIGNED",
            message: "Este cliente já está atribuído a este professor.",
          },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    const user = await selectTeacher("Rafael Andrade");
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Cliente"), "Bruno Alves · bruno@email.com");

    await user.click(screen.getByRole("button", { name: "Atribuir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este cliente já está atribuído a este professor.",
    );
  });

  it("sem permissão de remover, o botão Remover fica bloqueado", async () => {
    const withoutDelete: EffectivePermission[] = [
      {
        module: Module.CLIENTES,
        actions: [PermissionAction.VIEW, PermissionAction.CREATE],
        scope: PermissionScope.ALL,
      },
    ];
    mockSuccessfulLogin("Professor", withoutDelete);
    renderPage();
    await selectTeacher("Rafael Andrade");
    const row = await screen.findByRole("row", { name: /Marina Souza/ });

    expect(within(row).getByRole("button", { name: "Remover" })).toBeDisabled();
    expect(screen.getByLabelText("Cliente")).toBeEnabled();
  });

  it("avisa quando as opções ou a lista não carregam", async () => {
    server.use(
      http.get("/api/assignments/options", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as atribuições.",
    );
  });
});
