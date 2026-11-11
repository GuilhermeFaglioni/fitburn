import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { Module, PermissionAction, PermissionScope, type ProfileDetail } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ProfilesPage } from "../src/pages/ProfilesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const CATALOG = {
  modules: ["USUARIOS", "PERFIS_DE_ACESSO", "CLIENTES"],
  actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXECUTE"],
  scopes: ["ALL", "ASSIGNED_CLIENTS", "ASSIGNED_CLASSES", "OWN"],
};

const ADMIN_PROFILE: ProfileDetail = {
  id: "profile-admin",
  name: "Administrador",
  description: null,
  isSystem: true,
  isActive: true,
  moduleAccess: [],
};

const CLIENT_PROFILE: ProfileDetail = {
  id: "profile-cliente",
  name: "Cliente",
  description: null,
  isSystem: true,
  isActive: true,
  moduleAccess: [{ module: "USUARIOS", actions: ["VIEW"], scope: "OWN" }],
};

const CUSTOM_PROFILE: ProfileDetail = {
  id: "profile-recepcao",
  name: "Recepção",
  description: "Equipe da recepção",
  isSystem: false,
  isActive: true,
  moduleAccess: [],
};

function LoggedInProfilesPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <ProfilesPage />;
}

function renderProfilesPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/perfis-de-acesso"]}>
          <LoggedInProfilesPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ProfilesPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/profiles/catalog", () => HttpResponse.json(CATALOG)),
      http.get("/api/profiles", () =>
        HttpResponse.json([ADMIN_PROFILE, CLIENT_PROFILE, CUSTOM_PROFILE]),
      ),
    );
  });

  it("edita a matriz de um perfil customizado e salva", async () => {
    let savedBody: { actions: string[]; scope: string } | null = null;
    server.use(
      http.put("/api/profiles/:id/module-access/:module", async ({ request, params }) => {
        savedBody = (await request.json()) as { actions: string[]; scope: string };
        return HttpResponse.json({
          ...CUSTOM_PROFILE,
          moduleAccess: [{ module: params.module, ...savedBody }],
        });
      }),
    );

    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Recepção" }));
    await screen.findByText("Matriz de permissões — Recepção");

    const clientesRow = screen.getByRole("row", { name: /Clientes/ });
    await user.click(within(clientesRow).getByRole("checkbox", { name: /Ver em Clientes/ }));
    await user.selectOptions(
      within(clientesRow).getByRole("combobox", { name: "Escopo de Clientes" }),
      "ALL",
    );
    await user.click(within(clientesRow).getByRole("button", { name: "Salvar permissões de Clientes" }));

    await waitFor(() => {
      expect(savedBody).toMatchObject({ actions: ["VIEW"], scope: "ALL" });
    });
  });

  it("trocar de perfil atualiza a matriz para os dados do novo perfil selecionado", async () => {
    renderProfilesPage();
    const user = userEvent.setup();

    // Administrador primeiro: nenhuma linha tem ação marcada.
    await user.click(await screen.findByRole("button", { name: "Administrador" }));
    await screen.findByText("Matriz de permissões — Administrador");

    // Cliente depois: a linha de Usuários já vem com "Visualizar" marcado
    // (moduleAccess seedado). Reaproveitar o estado da linha do Administrador
    // em vez de reinicializar a partir do Cliente seria o bug regressivo.
    await user.click(screen.getByRole("button", { name: "Cliente" }));
    await screen.findByText("Matriz de permissões — Cliente");

    const usuariosRow = screen.getByRole("row", { name: /Usuários/ });
    expect(
      within(usuariosRow).getByRole("checkbox", { name: "Ver em Usuários" }),
    ).toBeChecked();
  });

  it("a matriz mostra o módulo Loja depois de Metas, com escopo Todos os registros", async () => {
    server.use(
      http.get("/api/profiles/catalog", () =>
        HttpResponse.json({
          ...CATALOG,
          modules: ["USUARIOS", "LOJA", "GAMIFICACAO", "CLIENTES"],
        }),
      ),
    );
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Recepção" }));
    await screen.findByText("Matriz de permissões — Recepção");

    const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    const order = ["Clientes", "Metas", "Loja", "Usuários"].map((label) =>
      rows.findIndex((text) => text.startsWith(label)),
    );
    expect(order.every((index) => index > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(screen.getByRole("checkbox", { name: "Ver em Loja" })).toBeInTheDocument();
  });

  describe("escopo da Loja (sempre Todos os registros)", () => {
    const SHOP_CATALOG = { ...CATALOG, modules: ["LOJA", "CLIENTES"] };
    const SCOPE_OPTIONS = ["Todos os registros", "Clientes atribuídos", "Aulas atribuídas", "Registros próprios"];

    function useShopCatalog(profiles: ProfileDetail[] = [ADMIN_PROFILE, CLIENT_PROFILE, CUSTOM_PROFILE]) {
      server.use(
        http.get("/api/profiles/catalog", () => HttpResponse.json(SHOP_CATALOG)),
        http.get("/api/profiles", () => HttpResponse.json(profiles)),
      );
    }

    function captureSavedBodies() {
      const saved: Record<string, { actions: string[]; scope: string }> = {};
      server.use(
        http.put("/api/profiles/:id/module-access/:module", async ({ request, params }) => {
          const body = (await request.json()) as { actions: string[]; scope: string };
          saved[params.module as string] = body;
          return HttpResponse.json({ ...CUSTOM_PROFILE, moduleAccess: [{ module: params.module, ...body }] });
        }),
      );
      return saved;
    }

    function optionLabels(select: HTMLElement) {
      return within(select)
        .getAllByRole("option")
        .map((option) => option.textContent);
    }

    it("num perfil de equipe novo, a linha da Loja oferece só Todos os registros; os outros módulos mantêm todos os escopos", async () => {
      useShopCatalog();
      renderProfilesPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Recepção" }));
      await screen.findByText("Matriz de permissões — Recepção");

      const lojaRow = screen.getByRole("row", { name: /Loja/ });
      const lojaScope = within(lojaRow).getByRole("combobox", { name: "Escopo de Loja" });
      expect(optionLabels(lojaScope)).toEqual(["Todos os registros"]);
      expect(lojaScope).toHaveValue("ALL");
      for (const other of ["Registros próprios", "Clientes atribuídos", "Aulas atribuídas"]) {
        expect(within(lojaRow).queryByText(other)).not.toBeInTheDocument();
      }

      const clientesRow = screen.getByRole("row", { name: /Clientes/ });
      expect(
        optionLabels(within(clientesRow).getByRole("combobox", { name: "Escopo de Clientes" })),
      ).toEqual(SCOPE_OPTIONS);
    });

    it("marcar Ver e salvar a Loja sem mexer no escopo envia scope ALL", async () => {
      useShopCatalog();
      const saved = captureSavedBodies();
      renderProfilesPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Recepção" }));
      await screen.findByText("Matriz de permissões — Recepção");

      const lojaRow = screen.getByRole("row", { name: /Loja/ });
      await user.click(within(lojaRow).getByRole("checkbox", { name: "Ver em Loja" }));
      await user.click(within(lojaRow).getByRole("button", { name: "Salvar permissões de Loja" }));

      await waitFor(() => expect(saved.LOJA).toEqual({ actions: ["VIEW"], scope: "ALL" }));
    });

    it("perfil com a Loja salva em OWN mostra Todos os registros e salva ALL", async () => {
      useShopCatalog([
        ADMIN_PROFILE,
        CLIENT_PROFILE,
        {
          ...CUSTOM_PROFILE,
          moduleAccess: [
            { module: "LOJA", actions: ["VIEW"], scope: "OWN" },
            { module: "CLIENTES", actions: ["VIEW"], scope: "OWN" },
          ],
        },
      ]);
      const saved = captureSavedBodies();
      renderProfilesPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Recepção" }));
      await screen.findByText("Matriz de permissões — Recepção");

      const lojaRow = screen.getByRole("row", { name: /Loja/ });
      const lojaScope = within(lojaRow).getByRole("combobox", { name: "Escopo de Loja" });
      expect(lojaScope).toHaveValue("ALL");
      expect(optionLabels(lojaScope)).toEqual(["Todos os registros"]);
      // Os outros módulos continuam refletindo o escopo salvo.
      const clientesRow = screen.getByRole("row", { name: /Clientes/ });
      expect(within(clientesRow).getByRole("combobox", { name: "Escopo de Clientes" })).toHaveValue("OWN");

      await user.click(within(lojaRow).getByRole("button", { name: "Salvar permissões de Loja" }));
      await waitFor(() => expect(saved.LOJA).toEqual({ actions: ["VIEW"], scope: "ALL" }));
    });

    it("no perfil Cliente a Loja segue com o isolamento fixo OWN, sem seletor", async () => {
      useShopCatalog();
      renderProfilesPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Cliente" }));
      await screen.findByText("Matriz de permissões — Cliente");

      const lojaRow = screen.getByRole("row", { name: /Loja/ });
      expect(within(lojaRow).getByText(/registros próprios \(fixo\)/i)).toBeInTheDocument();
      expect(within(lojaRow).queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  it("mostra o isolamento do Cliente como fixo, sem seletor de escopo editável", async () => {
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Cliente" }));

    expect(await screen.findByText(/acesso restrito aos próprios dados/i)).toBeInTheDocument();
    expect(screen.getAllByText(/registros próprios \(fixo\)/i)).toHaveLength(CATALOG.modules.length);
    expect(screen.queryByRole("combobox", { name: "Escopo de Usuários" })).not.toBeInTheDocument();
  });

  it("bloqueia a edição da matriz do Administrador", async () => {
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Administrador" }));

    expect(await screen.findByText(/administrador sempre tem acesso total/i)).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled();
    }
  });

  it("não mostra ações de desativar/reativar para perfis de sistema", async () => {
    renderProfilesPage();

    const clientListItem = (await screen.findByRole("button", { name: "Cliente" })).closest("li")!;
    expect(within(clientListItem).queryByRole("button", { name: /^Desativar perfil / })).not.toBeInTheDocument();
    expect(within(clientListItem).queryByRole("button", { name: /^Reativar perfil / })).not.toBeInTheDocument();

    const customListItem = screen.getByRole("button", { name: "Recepção" }).closest("li")!;
    expect(within(customListItem).getByRole("button", { name: "Desativar perfil Recepção" })).toBeInTheDocument();
  });

  it("sem permissão de criar e editar perfis, Novo perfil e Desativar ficam bloqueados, com o motivo", async () => {
    mockSuccessfulLogin("Professor", [
      {
        module: Module.PERFIS_DE_ACESSO,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ALL,
      },
    ]);
    renderProfilesPage();

    const create = await screen.findByRole("button", { name: "+ Novo perfil" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "Você não tem permissão para criar perfis.");
    const customItem = (await screen.findByRole("button", { name: "Recepção" })).closest("li")!;
    const deactivate = within(customItem).getByRole("button", { name: "Desativar perfil Recepção" });
    expect(deactivate).toBeDisabled();
    expect(deactivate).toHaveAttribute("title", "Você não tem permissão para alterar perfis.");
  });

  // Achado A2 da auditoria (docs/test-matrix.md), corrigido: a matriz só é editável com a ação EDIT em
  // Perfis de acesso.
  it("sem a ação EDIT em Perfis de acesso, os checkboxes, o escopo e o Salvar da matriz ficam desabilitados", async () => {
    mockSuccessfulLogin("Professor", [
      { module: Module.PERFIS_DE_ACESSO, actions: [PermissionAction.VIEW], scope: PermissionScope.ALL },
    ]);
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Recepção" }));
    await screen.findByText("Matriz de permissões — Recepção");

    const clientesRow = screen.getByRole("row", { name: /Clientes/ });
    for (const checkbox of within(clientesRow).getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled();
    }
    expect(within(clientesRow).getByRole("combobox", { name: "Escopo de Clientes" })).toBeDisabled();
    expect(within(clientesRow).getByRole("button", { name: "Salvar permissões de Clientes" })).toBeDisabled();
  });

  it("mostra erro ao carregar perfis e tenta a consulta novamente", async () => {
    let calls = 0;
    server.use(
      http.get("/api/profiles", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "TEMPORARY", message: "Indisponível." }, { status: 503 })
          : HttpResponse.json([ADMIN_PROFILE, CLIENT_PROFILE, CUSTOM_PROFILE]);
      }),
    );
    renderProfilesPage();
    const user = userEvent.setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os perfis.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("button", { name: "Recepção" })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("mostra erro ao carregar catálogo e tenta a consulta novamente", async () => {
    let calls = 0;
    server.use(
      http.get("/api/profiles/catalog", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "TEMPORARY", message: "Indisponível." }, { status: 503 })
          : HttpResponse.json(CATALOG);
      }),
    );
    renderProfilesPage();
    const user = userEvent.setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o catálogo de perfis.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Matriz de permissões — Administrador")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("marca o envio como ocupado (aria-busy) enquanto aguarda e mostra feedback com erro da API", async () => {
    let finishRequest!: () => void;
    const requestMayFinish = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    server.use(
      http.post("/api/profiles", async () => {
        await requestMayFinish;
        return HttpResponse.json(
          { code: "CREATE_FAILED", message: "Falha ao criar perfil." },
          { status: 500 },
        );
      }),
    );
    renderProfilesPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Novo perfil" }));
    await user.type(screen.getByLabelText("Nome"), "Novo perfil");
    const submit = screen.getByRole("button", { name: "Criar perfil" });
    await user.click(submit);
    await waitFor(() => expect(submit).toHaveAttribute("aria-busy", "true"));
    finishRequest();

    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao criar perfil.");
  });

  it("desabilita desativar enquanto aguarda e mostra feedback com erro da API", async () => {
    let finishRequest!: () => void;
    const requestMayFinish = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    server.use(
      http.post("/api/profiles/:id/deactivate", async () => {
        await requestMayFinish;
        return HttpResponse.json(
          { code: "DEACTIVATE_FAILED", message: "Falha ao desativar perfil." },
          { status: 500 },
        );
      }),
    );
    renderProfilesPage();
    const user = userEvent.setup();

    const deactivate = await screen.findByRole("button", { name: "Desativar perfil Recepção" });
    await user.click(deactivate);
    await waitFor(() => expect(deactivate).toBeDisabled());
    finishRequest();

    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao desativar perfil.");
  });

  it("desabilita reativar enquanto aguarda e mostra feedback com erro da API", async () => {
    let finishRequest!: () => void;
    const requestMayFinish = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    server.use(
      http.get("/api/profiles", () =>
        HttpResponse.json([ADMIN_PROFILE, CLIENT_PROFILE, { ...CUSTOM_PROFILE, isActive: false }]),
      ),
      http.post("/api/profiles/:id/activate", async () => {
        await requestMayFinish;
        return HttpResponse.json(
          { code: "ACTIVATE_FAILED", message: "Falha ao reativar perfil." },
          { status: 500 },
        );
      }),
    );
    renderProfilesPage();
    const user = userEvent.setup();

    const activate = await screen.findByRole("button", { name: "Reativar perfil Recepção" });
    await user.click(activate);
    await waitFor(() => expect(activate).toBeDisabled());
    finishRequest();

    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao reativar perfil.");
  });
});
