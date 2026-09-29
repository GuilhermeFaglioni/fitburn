import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { UsersPage } from "../src/pages/UsersPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function LoggedInUsersPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <UsersPage />;
}

function renderUsersPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWith(queryClient);
}

function renderWith(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/usuarios"]}>
          <LoggedInUsersPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const CLIENT_ATIVO = {
  id: "user-1",
  email: "cliente@fitburn.local",
  fullName: "Cliente Ativo",
  phone: "31999990000",
  birthDate: "1990-05-20",
  document: "12345678900",
  address: "Rua Um, 123",
  status: "ACTIVE" as const,
  profile: { id: "profile-cliente", name: "Cliente" },
};

describe("UsersPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
  });

  it("cadastra um cliente com sucesso e atualiza a lista", async () => {
    let usersInDb = [CLIENT_ATIVO];
    server.use(
      http.get("/api/users", () => HttpResponse.json(usersInDb)),
      http.post("/api/users/clients", async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        const created = {
          id: "user-2",
          email: body.email,
          fullName: body.fullName,
          phone: body.phone,
          birthDate: body.birthDate,
          document: body.document,
          address: body.address,
          status: "ACTIVE" as const,
          profile: { id: "profile-cliente", name: "Cliente" },
        };
        usersInDb = [...usersInDb, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderUsersPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Cliente Ativo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Novo cliente" }));
    await user.type(screen.getByLabelText("Nome completo"), "Novo Cliente");
    await user.type(screen.getByLabelText("E-mail"), "novo@fitburn.local");
    await user.type(screen.getByLabelText("Telefone"), "31988887777");
    await user.type(screen.getByLabelText("Data de nascimento"), "1995-01-10");
    await user.type(screen.getByLabelText("Documento"), "99988877766");
    await user.type(screen.getByLabelText("Endereço"), "Rua Dois, 456");
    await user.type(screen.getByLabelText("Senha inicial"), "SenhaForte123!");
    await user.click(screen.getByRole("button", { name: "Cadastrar cliente" }));

    expect(await screen.findByText("Novo Cliente")).toBeInTheDocument();
  });

  it("mostra a mensagem específica quando o e-mail já está em uso", async () => {
    server.use(
      http.get("/api/users", () => HttpResponse.json([])),
      http.post("/api/users/clients", () =>
        HttpResponse.json(
          { code: "EMAIL_ALREADY_IN_USE", message: "Este e-mail já está em uso." },
          { status: 409 },
        ),
      ),
    );

    renderUsersPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Novo cliente" }));
    await user.type(screen.getByLabelText("Nome completo"), "Cliente Repetido");
    await user.type(screen.getByLabelText("E-mail"), "existente@fitburn.local");
    await user.type(screen.getByLabelText("Telefone"), "31988887777");
    await user.type(screen.getByLabelText("Data de nascimento"), "1995-01-10");
    await user.type(screen.getByLabelText("Documento"), "99988877766");
    await user.type(screen.getByLabelText("Endereço"), "Rua Dois, 456");
    await user.type(screen.getByLabelText("Senha inicial"), "SenhaForte123!");
    await user.click(screen.getByRole("button", { name: "Cadastrar cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/este e-mail já está em uso/i);
  });

  it("desativa e reativa um usuário a partir da lista", async () => {
    let status: "ACTIVE" | "INACTIVE" = "ACTIVE";
    server.use(
      http.get("/api/users", () =>
        HttpResponse.json([{ ...CLIENT_ATIVO, status }]),
      ),
      http.post("/api/users/:id/deactivate", () => {
        status = "INACTIVE";
        return HttpResponse.json({ ...CLIENT_ATIVO, status });
      }),
      http.post("/api/users/:id/reactivate", () => {
        status = "ACTIVE";
        return HttpResponse.json({ ...CLIENT_ATIVO, status });
      }),
    );

    renderUsersPage();
    const user = userEvent.setup();

    const row = (await screen.findByText("Cliente Ativo")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Desativar" }));

    await waitFor(() => {
      expect(within(row).getByRole("button", { name: "Reativar" })).toBeInTheDocument();
    });

    await user.click(within(row).getByRole("button", { name: "Reativar" }));

    await waitFor(() => {
      expect(within(row).getByRole("button", { name: "Desativar" })).toBeInTheDocument();
    });
  });
  it("exclui um usuário com confirmação irreversível e ele sai da lista", async () => {
    const other = { ...CLIENT_ATIVO, id: "user-9", fullName: "Rafael Professor" };
    let usersInDb = [CLIENT_ATIVO, other];
    const deleted: string[] = [];
    server.use(
      http.get("/api/users", () => HttpResponse.json(usersInDb)),
      http.delete("/api/users/:id", ({ params }) => {
        deleted.push(String(params.id));
        usersInDb = usersInDb.filter((candidate) => candidate.id !== params.id);
        return HttpResponse.json({ ...other, fullName: "Usuário excluído", status: "DELETED" });
      }),
    );

    renderUsersPage();
    const user = userEvent.setup();

    const row = (await screen.findByText("Rafael Professor")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Excluir" }));
    const dialog = screen.getByRole("dialog", { name: "Excluir usuário?" });
    expect(dialog).toHaveTextContent(/anonimizados/i);
    expect(dialog).toHaveTextContent(/não pode ser desfeita/i);
    expect(deleted).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Excluir e anonimizar" }));

    await waitFor(() => expect(deleted).toEqual(["user-9"]));
    await waitFor(() => expect(screen.queryByText("Rafael Professor")).not.toBeInTheDocument());
  });

  it("depois de excluir, invalida também clientes, dashboard, ranking e as opções de planos, atribuição e professores", async () => {
    const other = { ...CLIENT_ATIVO, id: "user-9", fullName: "Rafael Professor" };
    server.use(
      http.get("/api/users", () => HttpResponse.json([CLIENT_ATIVO, other])),
      http.delete("/api/users/:id", () =>
        HttpResponse.json({ ...other, fullName: "Usuário excluído", status: "DELETED" }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Listas de outras telas, já em cache, que ainda mostram quem vai ser excluído.
    const otherScreens = [
      ["clients", { search: "", status: "" }],
      ["dashboard", "week"],
      ["gamification", "ranking", "week"],
      ["plan-options"],
      ["assignment-options"],
      ["instructors"],
    ];
    for (const key of otherScreens) queryClient.setQueryData(key, []);
    renderWith(queryClient);
    const user = userEvent.setup();

    const row = (await screen.findByText("Rafael Professor")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Excluir" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Excluir usuário?" })).getByRole("button", {
        name: "Excluir e anonimizar",
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    for (const key of otherScreens) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });

  it("não oferece excluir o próprio usuário", async () => {
    server.use(http.get("/api/users", () => HttpResponse.json([CLIENT_ATIVO])));

    renderUsersPage();

    const row = (await screen.findByText("Cliente Ativo")).closest("tr")!;
    expect(within(row).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });
});
