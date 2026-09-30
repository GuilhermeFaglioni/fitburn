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
  type ClientListItem,
  type ClientOverview,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientDetailPage } from "../src/pages/ClientDetailPage";
import { ClientsPage } from "../src/pages/ClientsPage";
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

function renderAt(
  path: string,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn>
            <Routes>
              <Route path="/clientes" element={<ClientsPage />} />
              <Route path="/clientes/:id" element={<ClientDetailPage />} />
            </Routes>
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const CLIENTS: ClientListItem[] = [
  {
    id: "c-marina",
    fullName: "Marina Souza",
    email: "marina@email.com",
    phone: "11999990000",
    document: "123.456.789-00",
    status: "ACTIVE",
    activePlan: { name: "Plano Performance", endDate: "2026-11-15" },
  },
  {
    id: "c-bruno",
    fullName: "Bruno Lima",
    email: "bruno@email.com",
    phone: null,
    document: "987.654.321-00",
    status: "INACTIVE",
    activePlan: null,
  },
];

const OVERVIEW: ClientOverview = {
  client: {
    id: "c-marina",
    email: "marina@email.com",
    fullName: "Marina Souza",
    phone: "11999990000",
    birthDate: "1994-03-12",
    document: "123.456.789-00",
    address: "Rua das Flores, 10",
    status: "ACTIVE",
    profile: { id: "p-client", name: "Cliente" },
  },
  plan: {
    active: {
      id: "a-1",
      plan: { id: "p-1", name: "Plano Performance", description: null },
      startDate: "2026-09-01",
      endDate: "2026-11-15",
      status: "ACTIVE",
    },
    history: [
      {
        id: "a-0",
        plan: { id: "p-0", name: "Plano Essencial", description: null },
        startDate: "2026-03-01",
        endDate: "2026-08-31",
        status: "ENDED",
      },
    ],
  },
  upcomingReservations: [
    {
      id: "r-1",
      status: "CONFIRMED",
      occurrence: {
        id: "o-1",
        name: "Yoga Flow",
        modality: { id: "m-1", name: "Yoga" },
        instructor: null,
        startsAt: "2099-10-01T21:00:00.000Z",
        endsAt: "2099-10-01T22:00:00.000Z",
        durationMinutes: 60,
        status: "SCHEDULED",
      },
      createdAt: "2026-09-20T10:00:00.000Z",
      cancelledAt: null,
    },
  ],
  pastReservations: [],
  gamification: {
    totalPoints: 120,
    history: [],
    streak: { current: 4, next: { threshold: 5, bonusPoints: 20 } },
    badges: [{ milestone: 3, earned: true, awardedAt: "2026-09-10T10:00:00.000Z" }],
  },
  workoutSheets: [
    {
      id: "w-1",
      clientId: "c-marina",
      title: "Ficha de Hipertrofia",
      notes: null,
      status: "ACTIVE",
      authorName: "Rafael",
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-12T10:00:00.000Z",
      exercises: [
        {
          id: "e-1",
          name: "Agachamento",
          sets: "4",
          reps: "10",
          load: null,
          duration: null,
          distance: null,
          notes: null,
        },
      ],
    },
  ],
};

describe("Clientes (equipe)", () => {
  const requests: string[] = [];

  beforeEach(() => {
    requests.length = 0;
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/clients", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url.search);
        const search = url.searchParams.get("search")?.toLowerCase();
        const status = url.searchParams.get("status");
        return HttpResponse.json(
          CLIENTS.filter(
            (client) =>
              (!search || client.fullName.toLowerCase().includes(search)) &&
              (!status || client.status === status),
          ),
        );
      }),
      http.get("/api/clients/:id", () => HttpResponse.json(OVERVIEW)),
    );
  });

  describe("Lista", () => {
    it("mostra nome, contato, plano ativo e status de cada cliente", async () => {
      renderAt("/clientes");

      const marina = (await screen.findByText("Marina Souza")).closest("tr")!;
      const bruno = screen.getByText("Bruno Lima").closest("tr")!;
      expect(within(marina).getByText("marina@email.com")).toBeInTheDocument();
      expect(within(marina).getByText(/Plano Performance/)).toBeInTheDocument();
      expect(within(marina).getByText("ATIVO")).toBeInTheDocument();
      expect(within(bruno).getByText("Sem plano")).toBeInTheDocument();
      expect(within(bruno).getByText("INATIVO")).toBeInTheDocument();
    });

    it("busca por nome, e-mail ou documento na API e filtra por status", async () => {
      const user = userEvent.setup();
      renderAt("/clientes");
      await screen.findByText("Marina Souza");

      await user.type(screen.getByLabelText("Buscar por nome, e-mail ou documento"), "bruno");
      await waitFor(() => expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument());
      expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
      expect(requests[requests.length - 1]).toBe("?search=bruno");

      await user.clear(screen.getByLabelText("Buscar por nome, e-mail ou documento"));
      await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
      await waitFor(() => expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument());
      expect(screen.getByText("Marina Souza")).toBeInTheDocument();
      expect(requests[requests.length - 1]).toBe("?status=ACTIVE");
    });

    it("avisa quando nenhum cliente é encontrado", async () => {
      const user = userEvent.setup();
      renderAt("/clientes");
      await screen.findByText("Marina Souza");

      await user.type(screen.getByLabelText("Buscar por nome, e-mail ou documento"), "zzz");

      expect(await screen.findByText("Nenhum cliente encontrado.")).toBeInTheDocument();
    });

    it("desativa e reativa a partir da linha", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      server.use(
        http.post("/api/clients/:id/:action", ({ params }) => {
          calls.push(`${String(params.id)}/${String(params.action)}`);
          return HttpResponse.json(OVERVIEW.client);
        }),
      );
      renderAt("/clientes");

      await user.click(await screen.findByRole("button", { name: "Desativar Marina Souza" }));
      await user.click(screen.getByRole("button", { name: "Reativar Bruno Lima" }));

      await waitFor(() => expect(calls).toEqual(["c-marina/deactivate", "c-bruno/reactivate"]));
    });

    describe("Exclusão com anonimização", () => {
      function mockDeletion(calls: string[], remaining: ClientListItem[] = CLIENTS) {
        let current = remaining;
        server.use(
          http.get("/api/clients", () => HttpResponse.json(current)),
          http.delete("/api/clients/:id", ({ params }) => {
            calls.push(String(params.id));
            current = current.filter((client) => client.id !== params.id);
            return HttpResponse.json({
              ...OVERVIEW.client,
              id: params.id,
              fullName: "Usuário excluído",
              status: "DELETED",
            });
          }),
        );
      }

      it("pede confirmação explicando que a anonimização é irreversível, sem excluir antes disso", async () => {
        const user = userEvent.setup();
        const calls: string[] = [];
        mockDeletion(calls);
        renderAt("/clientes");

        await user.click(await screen.findByRole("button", { name: "Excluir Marina Souza" }));

        const dialog = screen.getByRole("dialog", { name: "Excluir cliente?" });
        expect(dialog).toHaveTextContent("Marina Souza");
        expect(dialog).toHaveTextContent(/anonimizados/i);
        expect(dialog).toHaveTextContent(/não pode ser desfeita/i);
        expect(dialog).toHaveTextContent(/histórico.*mantido/i);
        expect(calls).toEqual([]);

        await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(calls).toEqual([]);
      });

      it("ao confirmar, exclui o cliente e ele some da lista", async () => {
        const user = userEvent.setup();
        const calls: string[] = [];
        mockDeletion(calls);
        renderAt("/clientes");

        await user.click(await screen.findByRole("button", { name: "Excluir Marina Souza" }));
        await user.click(screen.getByRole("button", { name: "Excluir e anonimizar" }));

        await waitFor(() => expect(calls).toEqual(["c-marina"]));
        await waitFor(() => expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
      });

      it("mostra a recusa da API sem fechar a confirmação", async () => {
        const user = userEvent.setup();
        server.use(
          http.delete("/api/clients/:id", () =>
            HttpResponse.json(
              { code: "USER_ALREADY_DELETED", message: "Este usuário já foi excluído." },
              { status: 409 },
            ),
          ),
        );
        renderAt("/clientes");

        await user.click(await screen.findByRole("button", { name: "Excluir Marina Souza" }));
        await user.click(screen.getByRole("button", { name: "Excluir e anonimizar" }));

        const dialog = screen.getByRole("dialog");
        expect(await within(dialog).findByRole("alert")).toHaveTextContent(
          "Este usuário já foi excluído.",
        );
      });
    });

    it("cadastra um cliente pelo modal", async () => {
      const user = userEvent.setup();
      let body: unknown;
      server.use(
        http.post("/api/clients", async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(OVERVIEW.client, { status: 201 });
        }),
      );
      renderAt("/clientes");
      await user.click(await screen.findByRole("button", { name: "+ Novo cliente" }));

      await user.type(screen.getByLabelText("Nome completo"), "Carla Nova");
      await user.type(screen.getByLabelText("E-mail"), "carla@email.com");
      await user.type(screen.getByLabelText("Telefone"), "11911112222");
      await user.type(screen.getByLabelText("Data de nascimento"), "1995-05-20");
      await user.type(screen.getByLabelText("Documento"), "111.222.333-44");
      await user.type(screen.getByLabelText("Endereço"), "Rua A, 1");
      await user.type(screen.getByLabelText("Senha inicial"), "SenhaForte123!");
      await user.click(screen.getByRole("button", { name: "Cadastrar cliente" }));

      await waitFor(() =>
        expect(body).toMatchObject({ fullName: "Carla Nova", email: "carla@email.com" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Novo cliente" })).not.toBeInTheDocument(),
      );
    });
  });

  describe("Sem permissão", () => {
    const VIEW_ONLY = [
      {
        module: Module.CLIENTES,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ];

    it("na lista, cadastrar, desativar e excluir ficam bloqueados, com o motivo", async () => {
      mockSuccessfulLogin("Professor", VIEW_ONLY);
      renderAt("/clientes");
      await screen.findByText("Marina Souza");

      const create = screen.getByRole("button", { name: "+ Novo cliente" });
      expect(create).toBeDisabled();
      expect(create).toHaveAttribute("title", "Você não tem permissão para cadastrar clientes.");
      const toggle = screen.getByRole("button", { name: "Desativar Marina Souza" });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute("title", "Você não tem permissão para alterar clientes.");
      const remove = screen.getByRole("button", { name: "Excluir Marina Souza" });
      expect(remove).toBeDisabled();
      expect(remove).toHaveAttribute("title", "Você não tem permissão para excluir clientes.");
    });

    it("no detalhe, editar, desativar e excluir ficam bloqueados; ver continua liberado", async () => {
      mockSuccessfulLogin("Professor", VIEW_ONLY);
      renderAt("/clientes/c-marina");

      expect(await screen.findByRole("heading", { name: "Marina Souza" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Editar dados" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Desativar cliente" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Excluir cliente" })).toBeDisabled();
      expect(screen.getByText("Rua das Flores, 10")).toBeInTheDocument();
    });

    it("com editar mas sem excluir, só a exclusão fica bloqueada", async () => {
      mockSuccessfulLogin("Professor", [
        {
          module: Module.CLIENTES,
          actions: [PermissionAction.VIEW, PermissionAction.EDIT],
          scope: PermissionScope.ASSIGNED_CLIENTS,
        },
      ]);
      renderAt("/clientes");
      await screen.findByText("Marina Souza");

      expect(screen.getByRole("button", { name: "Desativar Marina Souza" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Excluir Marina Souza" })).toBeDisabled();
    });
  });

  describe("Detalhe em abas", () => {
    it("navega entre dados pessoais, plano, reservas, gamificação e fichas", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");

      expect(await screen.findByRole("heading", { name: "Marina Souza" })).toBeInTheDocument();
      expect(screen.getByText("Rua das Flores, 10")).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Plano e histórico" }));
      expect(screen.getByText("Plano Performance")).toBeInTheDocument();
      expect(screen.getByText("Plano Essencial")).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Reservas" }));
      expect(screen.getByText("Yoga Flow")).toBeInTheDocument();
      expect(screen.getByText("Nenhuma reserva anterior.")).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Gamificação" }));
      expect(screen.getByText("120 pontos")).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Fichas" }));
      expect(screen.getByText("Ficha de Hipertrofia")).toBeInTheDocument();
    });

    it("edita os dados pessoais", async () => {
      const user = userEvent.setup();
      let body: unknown;
      server.use(
        http.patch("/api/clients/:id", async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(OVERVIEW.client);
        }),
      );
      renderAt("/clientes/c-marina");

      await user.click(await screen.findByRole("button", { name: "Editar dados" }));
      const phone = screen.getByLabelText("Telefone");
      await user.clear(phone);
      await user.type(phone, "11955554444");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(body).toMatchObject({ phone: "11955554444" }));
      expect(await screen.findByRole("button", { name: "Editar dados" })).toBeInTheDocument();
    });

    it("telefone, nascimento, documento e endereço são obrigatórios: não envia campo vazio nem só com espaços", async () => {
      const user = userEvent.setup();
      const bodies: unknown[] = [];
      server.use(
        http.patch("/api/clients/:id", async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(OVERVIEW.client);
        }),
      );
      renderAt("/clientes/c-marina");
      await user.click(await screen.findByRole("button", { name: "Editar dados" }));

      for (const label of ["Telefone", "Data de nascimento", "Documento", "Endereço"]) {
        expect(screen.getByLabelText(label)).toBeRequired();
      }
      const address = screen.getByLabelText("Endereço");
      await user.clear(address);
      await user.type(address, "   ");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/obrigat/i);
      expect(bodies).toHaveLength(0);

      await user.clear(address);
      await user.type(address, "Rua Nova, 5");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({
        phone: "11999990000",
        birthDate: "1994-03-12",
        document: "123.456.789-00",
        address: "Rua Nova, 5",
      });
    });

    it("exclui o cliente a partir do detalhe, com confirmação, e volta para a lista", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      server.use(
        http.delete("/api/clients/:id", ({ params }) => {
          calls.push(String(params.id));
          return HttpResponse.json({ ...OVERVIEW.client, fullName: "Usuário excluído", status: "DELETED" });
        }),
      );
      renderAt("/clientes/c-marina");

      await user.click(await screen.findByRole("button", { name: "Excluir cliente" }));
      const dialog = screen.getByRole("dialog", { name: "Excluir cliente?" });
      expect(dialog).toHaveTextContent(/não pode ser desfeita/i);
      await user.click(within(dialog).getByRole("button", { name: "Excluir e anonimizar" }));

      await waitFor(() => expect(calls).toEqual(["c-marina"]));
      expect(await screen.findByRole("heading", { name: "Clientes" })).toBeInTheDocument();
      expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();
    });

    it("depois de excluir, invalida a lista de usuários, o dashboard, o ranking e as opções de atribuição", async () => {
      const user = userEvent.setup();
      server.use(
        http.delete("/api/clients/:id", () =>
          HttpResponse.json({ ...OVERVIEW.client, fullName: "Usuário excluído", status: "DELETED" }),
        ),
      );
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const otherScreens = [
        ["users", { status: "" }],
        ["dashboard", "week"],
        ["gamification", "ranking", "week"],
        ["plan-options"],
        ["assignment-options"],
        ["workout-sheet-clients"],
      ];
      for (const key of otherScreens) queryClient.setQueryData(key, []);
      renderAt("/clientes/c-marina", queryClient);

      await user.click(await screen.findByRole("button", { name: "Excluir cliente" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Excluir cliente?" })).getByRole("button", {
          name: "Excluir e anonimizar",
        }),
      );

      expect(await screen.findByRole("heading", { name: "Clientes" })).toBeInTheDocument();
      for (const key of otherScreens) {
        expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
      }
    });

    it("um cliente excluído aparece como excluído e sem ações", async () => {
      server.use(
        http.get("/api/clients/:id", () =>
          HttpResponse.json({
            ...OVERVIEW,
            client: {
              ...OVERVIEW.client,
              fullName: "Usuário excluído",
              email: "excluido-c-marina@anonimizado.invalid",
              phone: null,
              birthDate: null,
              document: null,
              address: null,
              status: "DELETED",
            },
          }),
        ),
      );
      renderAt("/clientes/c-marina");

      expect(await screen.findByText("EXCLUÍDO")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Excluir cliente" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Desativar cliente" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Editar dados" })).not.toBeInTheDocument();
    });

    it("explica quando o cliente está fora do escopo", async () => {
      server.use(
        http.get("/api/clients/:id", () =>
          HttpResponse.json(
            { code: "OUT_OF_SCOPE", message: "Este cliente está fora do seu escopo." },
            { status: 403 },
          ),
        ),
      );
      renderAt("/clientes/c-outro");

      expect(await screen.findByRole("alert")).toHaveTextContent("fora do seu escopo");
    });
  });
});
