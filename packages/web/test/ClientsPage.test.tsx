import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ClientListItem, ClientOverview } from "@fitburn/contracts";
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

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
