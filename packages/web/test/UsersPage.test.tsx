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

    await user.click(screen.getByRole("button", { name: "Novo cliente" }));
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

    await user.click(await screen.findByRole("button", { name: "Novo cliente" }));
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
});
