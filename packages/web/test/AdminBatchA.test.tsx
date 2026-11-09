import { useEffect, useState, type ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  Assignment,
  AssignmentOptions,
  ClientListItem,
  ClientOverview,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AssignmentsPage } from "../src/pages/AssignmentsPage";
import { ClientCreatePage } from "../src/pages/ClientCreatePage";
import { ClientDetailPage } from "../src/pages/ClientDetailPage";
import { ClientsPage } from "../src/pages/ClientsPage";
import { UsuariosPerfisPage } from "../src/pages/UsuariosPerfisPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

/**
 * Admin, lote A (#156, PR 13): Clientes, Novo cliente, Detalhe do cliente, Usuários e perfis e Atribuições na nova
 * base. Aqui ficam a estrutura (tabela rotulada, títulos em ordem, ações com nome), os estados (carregando, erro,
 * vazio, offline) e os diálogos; o comportamento de cada fluxo está nos testes de cada tela.
 */

function LoggedIn({ children }: { children: ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  return ready ? <>{children}</> : null;
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn>
            <Routes>
              <Route path="/clientes" element={<ClientsPage />} />
              <Route path="/clientes/novo" element={<ClientCreatePage />} />
              <Route path="/clientes/:id" element={<ClientDetailPage />} />
              <Route path="/usuarios" element={<UsuariosPerfisPage />} />
              <Route path="/atribuicoes" element={<AssignmentsPage />} />
            </Routes>
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const CLIENTS: ClientListItem[] = [
  {
    id: "c-1",
    fullName: "Cliente Exemplo",
    email: "cliente1@exemplo.com",
    phone: "31900000001",
    document: "000.000.000-00",
    status: "ACTIVE",
    activePlan: { name: "Musculação 3x", endDate: "2026-12-01" },
  },
  {
    id: "c-2",
    fullName: "Aluna Teste",
    email: "aluna@exemplo.com",
    phone: null,
    document: "000.000.000-01",
    status: "INACTIVE",
    activePlan: null,
  },
];

const OVERVIEW: ClientOverview = {
  client: {
    id: "c-1",
    email: "cliente1@exemplo.com",
    fullName: "Cliente Exemplo",
    phone: "31900000001",
    birthDate: "1990-01-01",
    document: "000.000.000-00",
    address: "Rua Exemplo, 100",
    status: "ACTIVE",
    profile: { id: "p-client", name: "Cliente" },
  },
  plan: { active: null, history: [] },
  upcomingReservations: [],
  pastReservations: [],
  gamification: { totalPoints: 0, history: [], streak: { current: 0, next: null }, badges: [] },
  workoutSheets: [],
};

beforeEach(() => {
  mockSuccessfulLogin("Administrador");
  server.use(
    http.get("/api/clients", () => HttpResponse.json(CLIENTS)),
    http.get("/api/clients/:id", () => HttpResponse.json(OVERVIEW)),
  );
});

afterEach(() => onlineManager.setOnline(true));

/** Os níveis de título da tela, na ordem do documento. */
function headingLevels(): number[] {
  return screen.getAllByRole("heading").map((heading) => Number(heading.tagName.slice(1)));
}

describe("Clientes: tabela e estados", () => {
  it("a tabela tem nome, cabeçalhos de coluna e é uma região rolável focável", async () => {
    renderAt("/clientes");

    const table = await screen.findByRole("table", { name: "Clientes" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["Nome", "E-mail", "Telefone", "Plano", "Situação", "Ações"]);
    const region = screen.getByRole("region", { name: "Clientes" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table")).toBe(table);
  });

  it("tem um só título de nível 1 e a ação de novo cliente no cabeçalho", async () => {
    renderAt("/clientes");
    await screen.findByRole("table", { name: "Clientes" });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(headingLevels()).toEqual([1]);
    expect(screen.getByRole("button", { name: "+ Novo cliente" })).toBeEnabled();
  });

  it("cada ação de linha tem o nome do cliente, sem depender de onde o botão está", async () => {
    renderAt("/clientes");
    const row = (await screen.findByText("Cliente Exemplo")).closest("tr")!;

    for (const name of [
      "Editar cliente Cliente Exemplo",
      "Desativar cliente Cliente Exemplo",
      "Excluir cliente Cliente Exemplo",
    ]) {
      expect(within(row).getByRole("button", { name })).toBeInTheDocument();
    }
    const inactive = screen.getByText("Aluna Teste").closest("tr")!;
    expect(
      within(inactive).getByRole("button", { name: "Reativar cliente Aluna Teste" }),
    ).toBeInTheDocument();
  });

  it("a situação vai em texto (ATIVO e INATIVO), não só na cor do selo", async () => {
    renderAt("/clientes");
    const active = (await screen.findByText("Cliente Exemplo")).closest("tr")!;
    const inactive = screen.getByText("Aluna Teste").closest("tr")!;

    expect(within(active).getByText("ATIVO")).toBeInTheDocument();
    expect(within(inactive).getByText("INATIVO")).toBeInTheDocument();
  });

  it("o campo de busca e os filtros têm rótulo para leitor de tela", async () => {
    renderAt("/clientes");
    await screen.findByRole("table", { name: "Clientes" });

    expect(
      screen.getByRole("searchbox", { name: "Buscar por nome, e-mail ou documento" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Plano" })).toBeInTheDocument();
  });

  it("anuncia a quantidade de clientes", async () => {
    renderAt("/clientes");

    expect(await screen.findByText("2 clientes")).toHaveAttribute("role", "status");
  });

  it("carregando: mostra o texto da tela e nenhuma tabela", async () => {
    server.use(http.get("/api/clients", () => new Promise(() => {})));
    renderAt("/clientes");

    const loading = await screen.findByText("Carregando clientes…");
    expect(loading).toHaveAttribute("role", "status");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("vazio: mostra o estado vazio compartilhado, sem tabela", async () => {
    server.use(http.get("/api/clients", () => HttpResponse.json([])));
    renderAt("/clientes");

    const empty = await screen.findByText("Nenhum cliente encontrado.");
    expect(empty.closest("[data-state=empty]")).not.toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("erro: alerta com a mensagem da tela e botão para tentar de novo", async () => {
    let calls = 0;
    server.use(
      http.get("/api/clients", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "ERRO", message: "falhou" }, { status: 500 })
          : HttpResponse.json(CLIENTS);
      }),
    );
    renderAt("/clientes");
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar os clientes.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("table", { name: "Clientes" })).toBeInTheDocument();
  });

  it("offline: mostra o estado sem conexão (não um erro) e a lista volta com a rede", async () => {
    onlineManager.setOnline(false);
    renderAt("/clientes");

    const offline = await waitFor(() => {
      const found = document.querySelector('[data-state="offline"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    onlineManager.setOnline(true);

    expect(await screen.findByRole("table", { name: "Clientes" })).toBeInTheDocument();
  });
});

describe("Novo cliente: formulário em Card", () => {
  it("cada erro de campo marca aria-invalid e liga a mensagem por aria-describedby", async () => {
    server.use(
      http.post("/api/clients", () =>
        HttpResponse.json({ code: "DOCUMENT_ALREADY_IN_USE", message: "em uso" }, { status: 409 }),
      ),
    );
    renderAt("/clientes/novo");
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "Novo cliente" });

    await user.type(screen.getByLabelText("Nome completo *"), "Cliente Exemplo");
    await user.type(screen.getByLabelText("E-mail *"), "novo@exemplo.com");
    await user.type(screen.getByLabelText("Telefone *"), "31900000009");
    await user.type(screen.getByLabelText("Data de nascimento *"), "1990-01-01");
    await user.type(screen.getByLabelText("CPF (opcional)"), "000.000.000-00");
    await user.type(screen.getByLabelText("Senha inicial *"), "senha-exemplo-1");
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Este CPF já está cadastrado.");
    const document = screen.getByLabelText("CPF (opcional)");
    expect(document).toHaveAttribute("aria-invalid", "true");
    expect(document.getAttribute("aria-describedby")).toContain(alert.id);
    // O campo sem erro não é marcado.
    expect(screen.getByLabelText("E-mail *")).not.toHaveAttribute("aria-invalid");
  });

  it("o botão de salvar fica aria-busy enquanto a API responde e não aceita um segundo envio", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const posts: unknown[] = [];
    server.use(
      http.post("/api/clients", async ({ request }) => {
        posts.push(await request.json());
        await gate;
        return HttpResponse.json({ ...OVERVIEW.client, id: "c-9" }, { status: 201 });
      }),
    );
    renderAt("/clientes/novo");
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "Novo cliente" });

    await user.type(screen.getByLabelText("Nome completo *"), "Cliente Exemplo");
    await user.type(screen.getByLabelText("E-mail *"), "novo@exemplo.com");
    await user.type(screen.getByLabelText("Telefone *"), "31900000009");
    await user.type(screen.getByLabelText("Data de nascimento *"), "1990-01-01");
    await user.type(screen.getByLabelText("Senha inicial *"), "senha-exemplo-1");
    const save = screen.getByRole("button", { name: "Salvar cliente" });
    await user.click(save);

    await waitFor(() => expect(save).toHaveAttribute("aria-busy", "true"));
    await user.click(save);
    finish();

    expect(await screen.findByRole("status")).toHaveTextContent("Cliente cadastrado com sucesso.");
    expect(posts).toHaveLength(1);
  });

  it("os campos obrigatórios e opcionais têm rótulo; o formulário tem nome", async () => {
    renderAt("/clientes/novo");
    await screen.findByRole("heading", { level: 1, name: "Novo cliente" });

    expect(screen.getByRole("form", { name: "Cadastro de cliente" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo *")).toBeRequired();
    expect(screen.getByLabelText("Endereço (opcional)")).not.toBeRequired();
    expect(screen.getByLabelText("Senha inicial *")).toHaveAccessibleDescription(
      "Definida por você ou gerada e comunicada ao cliente fora do sistema.",
    );
  });
});

describe("Detalhe do cliente: cabeçalho, seções e exclusão em Dialog", () => {
  it("o título é só o nome (sem o selo), com a situação ao lado e as seções em ordem de títulos", async () => {
    renderAt("/clientes/c-1");

    const title = await screen.findByRole("heading", { level: 1, name: "Cliente Exemplo" });
    expect(screen.getByText("ATIVO")).toBeInTheDocument();
    expect(title).not.toHaveTextContent("ATIVO");

    const user = userEvent.setup();
    const sections = screen.getByRole("group", { name: "Seções do cliente" });
    await user.click(within(sections).getByRole("button", { name: "Reservas" }));
    expect(headingLevels()).toEqual([1, 2, 2]);
  });

  it("a seção atual fica marcada com aria-pressed", async () => {
    renderAt("/clientes/c-1");
    const user = userEvent.setup();
    const sections = await screen.findByRole("group", { name: "Seções do cliente" });

    expect(within(sections).getByRole("button", { name: "Dados pessoais" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(sections).getByRole("button", { name: "FitPoints" }));
    expect(within(sections).getByRole("button", { name: "FitPoints" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(sections).getByRole("button", { name: "Dados pessoais" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("a trilha leva de volta para Clientes", async () => {
    renderAt("/clientes/c-1");

    await screen.findByRole("heading", { level: 1, name: "Cliente Exemplo" });
    const crumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(within(crumb).getByRole("link", { name: "Clientes" })).toHaveAttribute(
      "href",
      "/clientes",
    );
  });

  it("excluir abre o Dialog com o texto de anonimização; Escape fecha e o foco volta ao botão", async () => {
    const calls: string[] = [];
    server.use(
      http.delete("/api/clients/:id", ({ params }) => {
        calls.push(String(params.id));
        return HttpResponse.json({ ...OVERVIEW.client, status: "DELETED" });
      }),
    );
    renderAt("/clientes/c-1");
    const user = userEvent.setup();

    const open = await screen.findByRole("button", { name: "Excluir cliente" });
    await user.click(open);

    const dialog = screen.getByRole("dialog", { name: "Excluir cliente?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/anonimizados permanentemente/);
    expect(dialog).toHaveTextContent("Cliente Exemplo será removido(a) da base ativa.");
    // O foco entra no diálogo, na saída segura (Cancelar).
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
    expect(calls).toEqual([]);
  });

  it("o diálogo prende o Tab entre Cancelar e Excluir e anonimizar", async () => {
    renderAt("/clientes/c-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Excluir cliente" }));
    const dialog = screen.getByRole("dialog", { name: "Excluir cliente?" });

    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Excluir e anonimizar" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("confirmar marca o botão como ocupado e a recusa da API aparece como alerta dentro do diálogo", async () => {
    server.use(
      http.delete("/api/clients/:id", () =>
        HttpResponse.json(
          { code: "USER_ALREADY_DELETED", message: "Este usuário já foi excluído." },
          { status: 409 },
        ),
      ),
    );
    renderAt("/clientes/c-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Excluir cliente" }));
    const dialog = screen.getByRole("dialog", { name: "Excluir cliente?" });

    await user.click(within(dialog).getByRole("button", { name: "Excluir e anonimizar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Este usuário já foi excluído.",
    );
    expect(screen.getByRole("dialog", { name: "Excluir cliente?" })).toBeInTheDocument();
  });

  it("carregando mostra o estado e a trilha de volta; fora do escopo vira alerta com a mensagem", async () => {
    server.use(
      http.get("/api/clients/:id", () =>
        HttpResponse.json({ code: "OUT_OF_SCOPE", message: "fora" }, { status: 403 }),
      ),
    );
    renderAt("/clientes/c-outro");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Este cliente está fora do seu escopo.");
    expect(screen.getByRole("link", { name: "← Clientes" })).toHaveAttribute("href", "/clientes");
  });

  it("offline: sem a rede mostra o estado sem conexão no lugar do cliente", async () => {
    onlineManager.setOnline(false);
    renderAt("/clientes/c-1");

    const offline = await waitFor(() => {
      const found = document.querySelector('[data-state="offline"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});

describe("Usuários e perfis: tabela de equipe e formulário em Dialog", () => {
  const STAFF = {
    id: "u-1",
    email: "prof@exemplo.com",
    fullName: "Prof. Exemplo",
    phone: null,
    birthDate: null,
    document: null,
    address: null,
    status: "ACTIVE" as const,
    profile: { id: "profile-professor", name: "Professor" },
  };

  beforeEach(() => {
    server.use(
      http.get("/api/users", () => HttpResponse.json([STAFF])),
      http.get("/api/profiles", () =>
        HttpResponse.json([
          {
            id: "profile-professor",
            name: "Professor",
            description: null,
            isSystem: false,
            isActive: true,
            moduleAccess: [],
          },
        ]),
      ),
    );
  });

  it("título de nível 1, grupo de seções e tabela da equipe com cabeçalhos", async () => {
    renderAt("/usuarios");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Usuários e perfis de acesso" }),
    ).toBeInTheDocument();
    const sections = screen.getByRole("group", { name: "Seções" });
    expect(within(sections).getByRole("button", { name: "Usuários" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const table = await screen.findByRole("table", { name: "Usuários da equipe" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Nome", "E-mail", "Perfil de acesso", "Situação", "Ações"]);
  });

  it("as ações da linha levam o nome do usuário", async () => {
    renderAt("/usuarios");
    const row = (await screen.findByText("Prof. Exemplo")).closest("tr")!;

    for (const name of [
      "Editar usuário Prof. Exemplo",
      "Desativar usuário Prof. Exemplo",
      "Redefinir senha de Prof. Exemplo",
      "Excluir usuário Prof. Exemplo",
    ]) {
      expect(within(row).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("Novo usuário abre um Dialog com campos rotulados; Escape fecha e devolve o foco", async () => {
    renderAt("/usuarios");
    const user = userEvent.setup();

    const open = await screen.findByRole("button", { name: "+ Novo usuário" });
    await user.click(open);

    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    expect(within(dialog).getByLabelText("Nome completo")).toBeRequired();
    expect(within(dialog).getByLabelText("E-mail")).toBeRequired();
    expect(within(dialog).getByLabelText("Perfil de acesso")).toBeRequired();
    expect(within(dialog).getByLabelText("Senha inicial")).toBeRequired();
    expect(within(dialog).getByLabelText("Nome completo")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it("o envio do Dialog fica aria-busy e a recusa da API aparece como alerta no próprio diálogo", async () => {
    server.use(
      http.post("/api/users/staff", () =>
        HttpResponse.json({ code: "EMAIL_ALREADY_IN_USE", message: "em uso" }, { status: 409 }),
      ),
    );
    renderAt("/usuarios");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Novo usuário" }));
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });

    await user.type(within(dialog).getByLabelText("Nome completo"), "Equipe Exemplo");
    await user.type(within(dialog).getByLabelText("E-mail"), "equipe@exemplo.com");
    await user.selectOptions(within(dialog).getByLabelText("Perfil de acesso"), "Professor");
    await user.type(within(dialog).getByLabelText("Senha inicial"), "senha-exemplo-1");
    await user.click(within(dialog).getByRole("button", { name: "Criar usuário" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Este e-mail já está em uso.",
    );
  });

  it("carregando e vazio usam os estados compartilhados", async () => {
    server.use(http.get("/api/users", () => HttpResponse.json([])));
    renderAt("/usuarios");

    const empty = await screen.findByText("Nenhum usuário encontrado.");
    expect(empty.closest("[data-state=empty]")).not.toBeNull();
  });

  it("perfis: a lista de perfis é uma lista rotulada, o perfil atual aparece pressionado e a matriz é uma tabela nomeada", async () => {
    server.use(
      http.get("/api/profiles/catalog", () =>
        HttpResponse.json({
          modules: ["CLIENTES"],
          actions: ["VIEW", "CREATE"],
          scopes: ["ALL", "OWN"],
        }),
      ),
    );
    renderAt("/usuarios");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Perfis de acesso" }));

    const list = await screen.findByRole("list", { name: "Perfis de acesso" });
    const profile = within(list).getByRole("button", { name: "Professor" });
    expect(profile).toHaveAttribute("aria-pressed", "true");
    expect(
      await screen.findByRole("table", { name: "Matriz de permissões — Professor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Matriz de permissões — Professor" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Ver em Clientes" })).toBeInTheDocument();
  });
});

describe("Atribuições: tabela e estados", () => {
  const RAFAEL = { id: "t-rafael", fullName: "Rafael Andrade" };
  const MARINA = { id: "c-marina", fullName: "Marina Souza", email: "marina@email.com" };
  const OPTIONS: AssignmentOptions = { teachers: [RAFAEL], clients: [MARINA] };
  const ASSIGNMENT: Assignment = {
    id: "a-1",
    teacher: RAFAEL,
    client: MARINA,
    createdAt: "2026-09-20T15:00:00.000Z",
  };

  beforeEach(() => {
    server.use(
      http.get("/api/assignments/options", () => HttpResponse.json(OPTIONS)),
      http.get("/api/assignments", () => HttpResponse.json([ASSIGNMENT])),
    );
  });

  it("título de nível 1, professor rotulado e tabela com o nome do professor e cabeçalhos", async () => {
    renderAt("/atribuicoes");
    const user = userEvent.setup();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Atribuição de clientes a professores",
      }),
    ).toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText("Professor"), "Rafael Andrade");

    const table = await screen.findByRole("table", {
      name: "Clientes atribuídos a Rafael Andrade",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Cliente", "E-mail", "Atribuído em", "Ações"]);
    expect(
      within(table).getByRole("button", { name: "Remover atribuição de Marina Souza" }),
    ).toBeInTheDocument();
    // A seção de atribuir é um título de nível 2 e o cartão é nomeado por ele.
    expect(screen.getByRole("heading", { level: 2, name: "Atribuir cliente" })).toBeInTheDocument();
    expect(headingLevels()).toEqual([1, 2]);
  });

  it("carregando as opções mostra o estado de carregando", async () => {
    server.use(http.get("/api/assignments/options", () => new Promise(() => {})));
    renderAt("/atribuicoes");

    expect(await screen.findByText("Carregando atribuições…")).toHaveAttribute("role", "status");
  });

  it("erro nas opções: alerta com tentar de novo", async () => {
    server.use(
      http.get("/api/assignments/options", () =>
        HttpResponse.json({ code: "ERRO", message: "falhou" }, { status: 500 }),
      ),
    );
    renderAt("/atribuicoes");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar as atribuições.");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("offline: mostra o estado sem conexão", async () => {
    onlineManager.setOnline(false);
    renderAt("/atribuicoes");

    const offline = await waitFor(() => {
      const found = document.querySelector('[data-state="offline"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
  });

  it("a linha mostra só o que já aparecia: nome, e-mail e data da atribuição, sem telefone nem documento", async () => {
    renderAt("/atribuicoes");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Professor"), "Rafael Andrade");

    const row = (await screen.findByText("Marina Souza", { selector: "td" })).closest("tr")!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["Marina Souza", "marina@email.com", "20/09/2026", "Remover"]);
  });
});
