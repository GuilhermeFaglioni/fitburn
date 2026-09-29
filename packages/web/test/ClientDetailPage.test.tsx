import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  type ClientDetail,
  type ClientPlan,
  type GamificationSummary,
  type ReservationDetail,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientDetailPage } from "../src/pages/ClientDetailPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const MARINA: ClientDetail = {
  id: "c-marina",
  fullName: "Marina Souza",
  email: "marina.souza@email.com",
  phone: "(11) 98765-4321",
  document: "111.222.333-44",
  birthDate: "1992-03-15",
  address: "Rua das Flores, 10",
  status: "ACTIVE",
  activePlan: { name: "Plano Performance", endDate: "2026-11-15" },
  createdAt: "2026-01-10T12:00:00Z",
};

const PLAN: ClientPlan = {
  active: {
    id: "a-2",
    plan: { id: "p-perf", name: "Plano Performance", description: null },
    startDate: "2026-09-01",
    endDate: "2026-11-15",
    status: "ACTIVE",
  },
  history: [
    {
      id: "a-1",
      plan: { id: "p-ess", name: "Plano Essencial", description: null },
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      status: "ENDED",
    },
  ],
};

function reservation(
  id: string,
  name: string,
  status: ReservationDetail["status"],
  startsAt: string,
): ReservationDetail {
  return {
    id,
    status,
    createdAt: "2026-09-20T12:00:00Z",
    cancelledAt: status === "CANCELLED" ? "2026-09-21T12:00:00Z" : null,
    occurrence: {
      id: `o-${id}`,
      name,
      modality: { id: "m-1", name: "Funcional" },
      instructor: { id: "i-1", fullName: "Rafael Andrade" },
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: "SCHEDULED",
    },
  };
}

const UPCOMING = [
  reservation("r-1", "Treino Funcional", "CONFIRMED", "2099-10-05T10:00:00Z"),
  reservation("r-2", "Yoga Flow", "CANCELLED", "2099-10-07T10:00:00Z"),
];
const PAST = [reservation("r-3", "Spinning", "COMPLETED", "2020-09-01T10:00:00Z")];

const GAMIFICATION: GamificationSummary = {
  totalPoints: 1250,
  history: [
    {
      id: "e-1",
      type: "ATTENDANCE",
      points: 10,
      occurredAt: "2026-09-28T10:00:00Z",
      subject: "Treino Funcional",
      milestone: null,
    },
  ],
  streak: { current: 4, next: { threshold: 5, bonusPoints: 30 } },
  badges: [
    { milestone: 3, earned: true, awardedAt: "2026-09-20T10:00:00Z" },
    { milestone: 5, earned: false, awardedAt: null },
  ],
};

const SHEETS: WorkoutSheet[] = [
  {
    id: "s-1",
    clientId: "c-marina",
    title: "Treino A - Peito e tríceps",
    notes: "Descanso de 60s",
    status: "ACTIVE",
    authorName: "Rafael Andrade",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-10T10:00:00Z",
    exercises: [
      {
        id: "x-1",
        name: "Supino reto",
        sets: "4",
        reps: "10",
        load: "40kg",
        duration: null,
        distance: null,
        notes: null,
      },
    ],
  },
];

function LoggedInPage({ path }: { path: string }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return (
    <Routes>
      <Route path="/clientes" element={<p>Lista de clientes</p>} />
      <Route path="/clientes/:id" element={<ClientDetailPage />} />
      <Route path="*" element={<p>{path}</p>} />
    </Routes>
  );
}

function renderPage(path = "/clientes/c-marina") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedInPage path={path} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Cliente (detalhe em abas)", () => {
  let client: ClientDetail;
  let requested: string[];

  beforeEach(() => {
    client = MARINA;
    requested = [];
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/clients/:id", () => {
        requested.push("detail");
        return HttpResponse.json(client);
      }),
      http.get("/api/clients/:id/plan", () => {
        requested.push("plan");
        return HttpResponse.json(PLAN);
      }),
      http.get("/api/clients/:id/reservations", ({ request }) => {
        const when = new URL(request.url).searchParams.get("when");
        requested.push(`reservations:${when}`);
        return HttpResponse.json(when === "past" ? PAST : UPCOMING);
      }),
      http.get("/api/clients/:id/gamification", () => {
        requested.push("gamification");
        return HttpResponse.json(GAMIFICATION);
      }),
      http.get("/api/clients/:id/workout-sheets", () => {
        requested.push("workout-sheets");
        return HttpResponse.json(SHEETS);
      }),
    );
  });

  it("abre em Dados pessoais, com o cabeçalho e as abas", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Marina Souza" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute("href", "/clientes");
    expect(screen.getByText("ATIVO")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Dados pessoais",
      "Plano e histórico",
      "Reservas",
      "Gamificação",
      "Fichas",
    ]);
    expect(screen.getByRole("tab", { name: "Dados pessoais" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const data = screen.getByRole("tabpanel");
    expect(within(data).getByText("marina.souza@email.com")).toBeInTheDocument();
    expect(within(data).getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(within(data).getByText("111.222.333-44")).toBeInTheDocument();
    expect(within(data).getByText("15/03/1992")).toBeInTheDocument();
    expect(within(data).getByText("Rua das Flores, 10")).toBeInTheDocument();
    expect(within(data).getByText("Plano Performance")).toBeInTheDocument();
  });

  it("só carrega os dados de uma aba quando ela é aberta", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    expect(requested).toEqual(["detail"]);

    await user.click(screen.getByRole("tab", { name: "Plano e histórico" }));
    await screen.findByText("Plano Essencial");

    expect(requested).toEqual(["detail", "plan"]);
  });

  it("aba Plano e histórico: o plano ativo e os anteriores", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Plano e histórico" }));

    const panel = await screen.findByRole("tabpanel");
    const active = await within(panel).findByLabelText("Plano ativo");
    expect(within(active).getByText("Plano Performance")).toBeInTheDocument();
    expect(within(active).getByText(/01\/09\/2026 – 15\/11\/2026/)).toBeInTheDocument();
    const history = within(panel).getByRole("region", { name: "Histórico de planos" });
    expect(within(history).getByText("Plano Essencial")).toBeInTheDocument();
    expect(within(history).getByText("ENCERRADO")).toBeInTheDocument();
  });

  it("aba Plano e histórico de quem não tem plano ativo", async () => {
    server.use(
      http.get("/api/clients/:id/plan", () => HttpResponse.json({ active: null, history: [] })),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Plano e histórico" }));

    expect(await screen.findByText("Sem plano ativo.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum plano anterior.")).toBeInTheDocument();
  });

  it("aba Reservas: próximas e anteriores, com o estado de cada uma", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Reservas" }));

    const upcoming = await screen.findByRole("region", { name: "Próximas reservas" });
    const confirmed = (await within(upcoming).findByText("Treino Funcional")).closest("li")!;
    expect(within(confirmed).getByText("CONFIRMADA")).toBeInTheDocument();
    expect(within(confirmed).getByText(/07h00/)).toBeInTheDocument();
    expect(within(confirmed).getByText(/Rafael Andrade/)).toBeInTheDocument();
    expect(
      within(within(upcoming).getByText("Yoga Flow").closest("li")!).getByText("CANCELADA"),
    ).toBeInTheDocument();
    const past = screen.getByRole("region", { name: "Reservas anteriores" });
    expect(
      within((await within(past).findByText("Spinning")).closest("li")!).getByText("CONCLUÍDA"),
    ).toBeInTheDocument();
    expect(requested).toContain("reservations:upcoming");
    expect(requested).toContain("reservations:past");
  });

  it("aba Reservas sem nenhuma reserva mostra o estado vazio", async () => {
    server.use(http.get("/api/clients/:id/reservations", () => HttpResponse.json([])));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Reservas" }));

    expect(await screen.findByText("Nenhuma reserva próxima.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma reserva anterior.")).toBeInTheDocument();
  });

  it("aba Gamificação: pontos, streak, marcos e o histórico recente", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Gamificação" }));

    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("1.250")).toBeInTheDocument();
    expect(within(panel).getByText("pontos totais")).toBeInTheDocument();
    expect(within(panel).getByText("4 dias seguidos")).toBeInTheDocument();
    expect(within(panel).getByText("Próximo marco: 5 dias (+30 pontos)")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Streak de 3, conquistado")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Streak de 5, bloqueado")).toBeInTheDocument();
    expect(within(panel).getByText("Presença confirmada · Treino Funcional")).toBeInTheDocument();
    expect(within(panel).getByText("+10")).toBeInTheDocument();
  });

  it("aba Fichas: as fichas do cliente com o exercício e quem montou", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Fichas" }));

    const sheet = (await screen.findByText("Treino A - Peito e tríceps")).closest("li")!;
    expect(within(sheet).getByText("ATIVA")).toBeInTheDocument();
    expect(within(sheet).getByText(/Rafael Andrade/)).toBeInTheDocument();
    expect(within(sheet).getByText("Supino reto")).toBeInTheDocument();
    expect(within(sheet).getByText(/4 × 10/)).toBeInTheDocument();
    expect(within(sheet).getByText(/40kg/)).toBeInTheDocument();
  });

  it("aba Fichas sem nenhuma ficha mostra o estado vazio", async () => {
    server.use(http.get("/api/clients/:id/workout-sheets", () => HttpResponse.json([])));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Fichas" }));

    expect(
      await screen.findByText("Nenhuma ficha de treino para este cliente."),
    ).toBeInTheDocument();
  });

  it("um cliente fora do escopo mostra o motivo da API", async () => {
    server.use(
      http.get("/api/clients/:id", () =>
        HttpResponse.json(
          { code: "OUT_OF_SCOPE", message: "Este cliente está fora do seu escopo." },
          { status: 403 },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este cliente está fora do seu escopo.",
    );
    expect(screen.getByRole("link", { name: "Voltar para Clientes" })).toHaveAttribute(
      "href",
      "/clientes",
    );
  });

  it("uma aba que falha ao carregar mostra o erro sem derrubar as outras", async () => {
    server.use(
      http.get("/api/clients/:id/plan", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro." }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("tab", { name: "Plano e histórico" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o plano.",
    );
    await user.click(screen.getByRole("tab", { name: "Fichas" }));

    expect(await screen.findByText("Treino A - Peito e tríceps")).toBeInTheDocument();
  });

  it("desativa o cliente pelo cabeçalho, com confirmação, e o selo passa a Inativo", async () => {
    server.use(
      http.post("/api/clients/:id/deactivate", () => {
        client = { ...MARINA, status: "INACTIVE" };
        return HttpResponse.json(client);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("button", { name: "Desativar" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Desativar cliente" }),
    );

    await waitFor(() => expect(screen.getByText("INATIVO")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reativar" })).toBeInTheDocument();
  });

  it("edita o cliente pelo cabeçalho e o detalhe reflete a mudança", async () => {
    server.use(
      http.patch("/api/clients/:id", async ({ request }) => {
        client = { ...MARINA, ...((await request.json()) as Partial<ClientDetail>) };
        return HttpResponse.json(client);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Marina Souza" });

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Nome completo")).toHaveValue("Marina Souza"),
    );
    await user.clear(within(dialog).getByLabelText("Nome completo"));
    await user.type(within(dialog).getByLabelText("Nome completo"), "Marina S. Andrade");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("heading", { name: "Marina S. Andrade" })).toBeInTheDocument();
  });
});
