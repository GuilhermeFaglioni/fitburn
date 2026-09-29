import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type ClientDetail,
  type ClientListItem,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientsPage } from "../src/pages/ClientsPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function client(
  id: string,
  fullName: string,
  overrides: Partial<ClientListItem> = {},
): ClientListItem {
  return {
    id,
    fullName,
    email: `${fullName.toLowerCase().replace(/\s+/g, ".")}@email.com`,
    phone: "(11) 98765-4321",
    document: "111.222.333-44",
    status: "ACTIVE",
    activePlan: null,
    ...overrides,
  };
}

/** O detalhe que a API devolve ao criar, editar, desativar e reativar. */
function asDetail(item: ClientListItem | undefined): ClientDetail {
  return {
    ...item!,
    birthDate: "1992-03-15",
    address: "Rua das Flores, 10",
    createdAt: "2026-01-10T12:00:00Z",
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return (
    <Routes>
      <Route path="/clientes" element={<ClientsPage />} />
      <Route path="/clientes/:id" element={<p>Detalhe do cliente</p>} />
    </Routes>
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/clientes"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Clientes (lista)", () => {
  let clients: ClientListItem[];
  let listQueries: string[];
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  beforeEach(() => {
    clients = [
      client("c-marina", "Marina Souza", {
        activePlan: { name: "Plano Performance", endDate: "2026-11-15" },
      }),
      client("c-bruno", "Bruno Lima", {
        status: "INACTIVE",
        email: "bruno.lima@email.com",
        document: "555.666.777-88",
        phone: "(11) 96654-1122",
      }),
      client("c-camila", "Camila Ferreira", { document: "999.000.111-22" }),
    ];
    listQueries = [];
    calls.length = 0;
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/clients", ({ request }) => {
        const url = new URL(request.url);
        listQueries.push(url.search);
        const search = url.searchParams.get("search")?.toLowerCase();
        const status = url.searchParams.get("status");
        return HttpResponse.json(
          clients.filter(
            (item) =>
              (!status || item.status === status) &&
              (!search ||
                [item.fullName, item.email, item.document ?? ""].some((field) =>
                  field.toLowerCase().includes(search),
                )),
          ),
        );
      }),
      http.post("/api/clients", async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        calls.push({ method: "POST", path: "/api/clients", body });
        const created = client("c-novo", body.fullName, { email: body.email, phone: body.phone });
        clients.push(created);
        return HttpResponse.json(asDetail(created), { status: 201 });
      }),
      http.patch("/api/clients/:id", async ({ params, request }) => {
        const body = (await request.json()) as Partial<ClientListItem>;
        calls.push({ method: "PATCH", path: `/api/clients/${String(params.id)}`, body });
        clients = clients.map((item) => (item.id === params.id ? { ...item, ...body } : item));
        return HttpResponse.json(asDetail(clients.find((item) => item.id === params.id)));
      }),
      http.post("/api/clients/:id/:action", ({ params }) => {
        calls.push({
          method: "POST",
          path: `/api/clients/${String(params.id)}/${String(params.action)}`,
        });
        clients = clients.map((item) =>
          item.id === params.id
            ? { ...item, status: params.action === "deactivate" ? "INACTIVE" : "ACTIVE" }
            : item,
        );
        return HttpResponse.json(asDetail(clients.find((item) => item.id === params.id)));
      }),
    );
  });

  function row(name: string) {
    return screen.getByText(name).closest("tr")!;
  }

  it("lista nome, contato, plano ativo e status, com a contagem de clientes", async () => {
    renderPage();

    const marina = row(await screen.findByText("Marina Souza").then((el) => el.textContent!));
    expect(within(marina).getByText("marina.souza@email.com")).toBeInTheDocument();
    expect(within(marina).getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(within(marina).getByText("Plano Performance")).toBeInTheDocument();
    expect(within(marina).getByText("ATIVO")).toBeInTheDocument();
    const bruno = row("Bruno Lima");
    expect(within(bruno).getByText("Sem plano ativo")).toBeInTheDocument();
    expect(within(bruno).getByText("INATIVO")).toBeInTheDocument();
    expect(screen.getByText("3 clientes")).toBeInTheDocument();
  });

  it("o nome leva ao detalhe do cliente", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("link", { name: "Marina Souza" }));

    expect(await screen.findByText("Detalhe do cliente")).toBeInTheDocument();
  });

  it("busca por nome, e-mail ou documento pela API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Marina Souza");

    await user.type(screen.getByLabelText("Buscar por nome, e-mail ou documento"), "555.666");

    await waitFor(() => expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument());
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getByText("1 cliente")).toBeInTheDocument();
    expect(listQueries[listQueries.length - 1]).toBe("?search=555.666");
  });

  it("não dispara uma consulta a cada tecla digitada", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Marina Souza");
    const before = listQueries.length;

    await user.type(screen.getByLabelText("Buscar por nome, e-mail ou documento"), "camila");
    await screen.findByText("1 cliente");

    expect(listQueries.length - before).toBeLessThanOrEqual(2);
  });

  it("filtra por status", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Marina Souza");

    await user.selectOptions(screen.getByLabelText("Status"), "Inativo");

    await waitFor(() => expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument());
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(listQueries[listQueries.length - 1]).toBe("?status=INACTIVE");
  });

  it("sem resultado mostra o estado vazio", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Marina Souza");

    await user.type(screen.getByLabelText("Buscar por nome, e-mail ou documento"), "zzz");

    expect(await screen.findByText("Nenhum cliente encontrado.")).toBeInTheDocument();
  });

  it("mostra o erro quando a lista não carrega", async () => {
    server.use(
      http.get("/api/clients", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro." }, { status: 500 }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os clientes.",
    );
  });

  describe("Desativar e reativar", () => {
    it("desativar pede confirmação e explica que as reservas existentes são mantidas", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(within(row("Marina Souza")).getByRole("button", { name: "Desativar" }));
      const dialog = screen.getByRole("dialog");

      expect(dialog).toHaveTextContent("Marina Souza");
      expect(dialog).toHaveTextContent("não poderá entrar nem reservar");
      expect(dialog).toHaveTextContent("reservas já existentes são mantidas");
      expect(calls).toEqual([]);

      await user.click(within(dialog).getByRole("button", { name: "Desativar cliente" }));

      await waitFor(() =>
        expect(within(row("Marina Souza")).getByText("INATIVO")).toBeInTheDocument(),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls).toEqual([{ method: "POST", path: "/api/clients/c-marina/deactivate" }]);
    });

    it("cancelar a confirmação não desativa", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(within(row("Marina Souza")).getByRole("button", { name: "Desativar" }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }),
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls).toEqual([]);
    });

    it("reativa um cliente inativo direto, sem confirmação", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Bruno Lima");

      await user.click(within(row("Bruno Lima")).getByRole("button", { name: "Reativar" }));

      await waitFor(() => expect(within(row("Bruno Lima")).getByText("ATIVO")).toBeInTheDocument());
      expect(calls).toEqual([{ method: "POST", path: "/api/clients/c-bruno/reactivate" }]);
    });

    it("mostra o motivo quando a API recusa a ação", async () => {
      server.use(
        http.post("/api/clients/:id/deactivate", () =>
          HttpResponse.json(
            { code: "OUT_OF_SCOPE", message: "Este cliente está fora do seu escopo." },
            { status: 403 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(within(row("Marina Souza")).getByRole("button", { name: "Desativar" }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Desativar cliente" }),
      );

      expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
        "Este cliente está fora do seu escopo.",
      );
    });
  });

  describe("Cadastro e edição", () => {
    it("cadastra um cliente pelo formulário", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(screen.getByRole("button", { name: "+ Novo cliente" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Nome completo"), "Diego Martins");
      await user.type(within(dialog).getByLabelText("E-mail"), "diego@email.com");
      await user.type(within(dialog).getByLabelText("Telefone"), "11944335566");
      await user.type(within(dialog).getByLabelText("Data de nascimento"), "1994-06-10");
      await user.type(within(dialog).getByLabelText("Documento"), "123.456.789-00");
      await user.type(within(dialog).getByLabelText("Endereço"), "Rua Um, 10");
      await user.type(within(dialog).getByLabelText("Senha inicial"), "SenhaForte123!");
      await user.click(within(dialog).getByRole("button", { name: "Salvar cliente" }));

      expect(await screen.findByText("Diego Martins")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls).toEqual([
        {
          method: "POST",
          path: "/api/clients",
          body: {
            fullName: "Diego Martins",
            email: "diego@email.com",
            phone: "11944335566",
            birthDate: "1994-06-10",
            document: "123.456.789-00",
            address: "Rua Um, 10",
            password: "SenhaForte123!",
          },
        },
      ]);
    });

    it("valida no cliente antes de enviar: campos faltando e senha curta não chegam à API", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(screen.getByRole("button", { name: "+ Novo cliente" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Nome completo"), "Diego Martins");
      await user.type(within(dialog).getByLabelText("E-mail"), "diego@email.com");
      await user.type(within(dialog).getByLabelText("Senha inicial"), "curta");
      await user.click(within(dialog).getByRole("button", { name: "Salvar cliente" }));

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("Telefone é obrigatório.");
      expect(alert).toHaveTextContent("A senha precisa ter pelo menos 8 caracteres.");
      expect(calls).toEqual([]);
      expect(dialog).toBeInTheDocument();
    });

    it("mostra o erro da API, por exemplo e-mail já cadastrado, sem fechar o formulário", async () => {
      server.use(
        http.post("/api/clients", () =>
          HttpResponse.json(
            { code: "EMAIL_ALREADY_IN_USE", message: "Este e-mail já está em uso." },
            { status: 409 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(screen.getByRole("button", { name: "+ Novo cliente" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Nome completo"), "Diego Martins");
      await user.type(within(dialog).getByLabelText("E-mail"), "marina.souza@email.com");
      await user.type(within(dialog).getByLabelText("Telefone"), "11944335566");
      await user.type(within(dialog).getByLabelText("Data de nascimento"), "1994-06-10");
      await user.type(within(dialog).getByLabelText("Documento"), "123.456.789-00");
      await user.type(within(dialog).getByLabelText("Endereço"), "Rua Um, 10");
      await user.type(within(dialog).getByLabelText("Senha inicial"), "SenhaForte123!");
      await user.click(within(dialog).getByRole("button", { name: "Salvar cliente" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Este e-mail já está em uso.",
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("edita um cliente: o formulário vem preenchido e só o que mudou é enviado", async () => {
      server.use(
        http.get("/api/clients/:id", ({ params }) =>
          HttpResponse.json(asDetail(clients.find((item) => item.id === params.id))),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Marina Souza");

      await user.click(within(row("Marina Souza")).getByRole("button", { name: "Editar" }));
      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(within(dialog).getByLabelText("Endereço")).toHaveValue("Rua das Flores, 10"),
      );
      expect(within(dialog).getByLabelText("Nome completo")).toHaveValue("Marina Souza");
      expect(within(dialog).getByLabelText("Data de nascimento")).toHaveValue("1992-03-15");
      expect(within(dialog).queryByLabelText("Senha inicial")).not.toBeInTheDocument();
      await user.clear(within(dialog).getByLabelText("Telefone"));
      await user.type(within(dialog).getByLabelText("Telefone"), "11900001111");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls).toEqual([
        { method: "PATCH", path: "/api/clients/c-marina", body: { phone: "11900001111" } },
      ]);
      expect(await screen.findByText("11900001111")).toBeInTheDocument();
    });
  });

  it("sem permissão de criar e editar, os botões ficam bloqueados", async () => {
    mockSuccessfulLogin("Professor", [
      {
        module: Module.CLIENTES,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ]);
    renderPage();
    await screen.findByText("Marina Souza");

    expect(screen.getByRole("button", { name: "+ Novo cliente" })).toBeDisabled();
    expect(within(row("Marina Souza")).getByRole("button", { name: "Editar" })).toBeDisabled();
    expect(within(row("Marina Souza")).getByRole("button", { name: "Desativar" })).toBeDisabled();
    expect(within(row("Bruno Lima")).getByRole("button", { name: "Reativar" })).toBeDisabled();
  });
});
