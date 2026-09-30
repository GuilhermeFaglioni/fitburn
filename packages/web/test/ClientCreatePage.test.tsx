import { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Module, PermissionAction, PermissionScope } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientCreatePage } from "../src/pages/ClientCreatePage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function LoggedIn({ children }: { children: React.ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  return ready ? <>{children}</> : null;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/clientes/novo"]}>
          <LoggedIn>
            <Routes>
              <Route path="/clientes" element={<h1>Clientes (lista)</h1>} />
              <Route path="/clientes/novo" element={<ClientCreatePage />} />
            </Routes>
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome completo *"), "Carla Nova");
  await user.type(screen.getByLabelText("E-mail *"), "carla@email.com");
  await user.type(screen.getByLabelText("Telefone *"), "11911112222");
  await user.type(screen.getByLabelText("Data de nascimento *"), "1995-05-20");
  await user.type(screen.getByLabelText("CPF *"), "111.222.333-44");
  await user.type(screen.getByLabelText("Endereço"), "Rua A, 1");
  await user.type(screen.getByLabelText("Senha inicial *"), "SenhaForte123!");
}

describe("Cadastro de cliente (tela cheia)", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
  });

  it("mostra a migalha, o título e os campos do design", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Novo cliente" })).toBeInTheDocument();
    expect(screen.getByText("Clientes / Novo cliente")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nome e sobrenome")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("email@exemplo.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("(00) 00000-0000")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("000.000.000-00")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Rua, número, bairro, cidade")).toBeInTheDocument();
    expect(screen.getByLabelText("Perfil de acesso *")).toHaveValue("Cliente");
    expect(
      screen.getByText("Somente administradores podem alterar o perfil de acesso."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Definida por você ou gerada e comunicada ao cliente fora do sistema."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar cliente" })).toBeInTheDocument();
  });

  it("cadastra o cliente, mostra a faixa de sucesso e volta para a listagem", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/clients", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: "user-2",
            email: "carla@email.com",
            fullName: "Carla Nova",
            phone: "11911112222",
            birthDate: "1995-05-20",
            document: "111.222.333-44",
            address: "Rua A, 1",
            status: "ACTIVE",
            profile: { id: "profile-cliente", name: "Cliente" },
          },
          { status: 201 },
        );
      }),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Novo cliente" });

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cliente cadastrado com sucesso. Voltando para a listagem de clientes…",
    );
    expect(body).toMatchObject({
      fullName: "Carla Nova",
      email: "carla@email.com",
      phone: "11911112222",
      birthDate: "1995-05-20",
      document: "111.222.333-44",
      address: "Rua A, 1",
      password: "SenhaForte123!",
    });
    expect(
      await screen.findByRole("heading", { name: "Clientes (lista)" }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("mostra o erro sob o campo de e-mail quando ele já está cadastrado", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/clients", () =>
        HttpResponse.json(
          { code: "EMAIL_ALREADY_IN_USE", message: "Este e-mail já está em uso." },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Novo cliente" });

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Este e-mail já está cadastrado.");
    const email = screen.getByLabelText("E-mail *");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", alert.id);
    expect(email).toHaveClass("fb-field-error");
    // Sem faixa de sucesso e o formulário continua preenchido.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(email).toHaveValue("carla@email.com");
  });

  it("mostra o erro sob o campo de CPF quando o documento já está cadastrado", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/clients", () =>
        HttpResponse.json(
          { code: "DOCUMENT_ALREADY_IN_USE", message: "Este documento já está em uso." },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Novo cliente" });

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Este CPF já está cadastrado.");
    expect(screen.getByLabelText("CPF *")).toHaveAttribute("aria-invalid", "true");
  });

  it("avisa com um alerta geral quando a API recusa os dados", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/clients", () =>
        HttpResponse.json({ code: "VALIDATION_ERROR", message: "x" }, { status: 400 }),
      ),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Novo cliente" });

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Confira os campos e tente novamente.",
    );
  });

  it("Cancelar volta para a listagem sem cadastrar", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Novo cliente" });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("heading", { name: "Clientes (lista)" })).toBeInTheDocument();
  });

  it("sem permissão de cadastrar, avisa e bloqueia o envio", async () => {
    mockSuccessfulLogin("Professor", [
      {
        module: Module.CLIENTES,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ]);
    renderPage();

    expect(
      await screen.findByText("Você não tem permissão para cadastrar clientes."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salvar cliente" })).toBeDisabled(),
    );
  });
});
