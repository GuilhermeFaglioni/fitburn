import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { Dashboard, RankingPeriodName } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { DashboardPage } from "../src/pages/DashboardPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

// Hoje: quarta-feira 2026-09-30, em torno das 10h na academia (UTC-3).
const TODAY = "2026-09-30";

function dashboardOf(period: RankingPeriodName, overrides: Partial<Dashboard> = {}): Dashboard {
  const gamification =
    period === "week"
      ? {
          pointsDistributed: 65,
          attendances: 4,
          clientsWithActiveStreak: 1,
          top: [
            {
              clientId: "c-bruno",
              position: 1,
              fullName: "Bruno Alves", points: 35, attendances: 1, tied: false },
            {
              clientId: "c-ana",
              position: 2,
              fullName: "Ana Paula Souza", points: 20, attendances: 2, tied: false },
          ],
        }
      : {
          pointsDistributed: 240,
          attendances: 18,
          clientsWithActiveStreak: 3,
          top: [
            {
              clientId: "c-ana",
              position: 1,
              fullName: "Ana Paula Souza",
              points: 120, attendances: 9, tied: false },
          ],
        };
  return {
    period,
    from: period === "week" ? "2026-09-28" : "2026-09-01",
    to: period === "week" ? "2026-10-04" : "2026-09-30",
    today: TODAY,
    occupancy: {
      today: [
        {
          id: "o1",
          name: "Treino Funcional",
          startsAt: "2026-09-30T10:00:00.000Z",
          capacity: 12,
          booked: 9,
          availableSpots: 3,
        },
        {
          id: "o2",
          name: "Yoga",
          startsAt: "2026-09-30T21:00:00.000Z",
          capacity: 2,
          booked: 2,
          availableSpots: 0,
        },
      ],
      week: [
        {
          id: "o1",
          name: "Treino Funcional",
          startsAt: "2026-09-30T10:00:00.000Z",
          capacity: 12,
          booked: 9,
          availableSpots: 3,
        },
        {
          id: "o3",
          name: "Pilates",
          startsAt: "2026-10-01T12:00:00.000Z",
          capacity: 8,
          booked: 1,
          availableSpots: 7,
        },
      ],
    },
    activeClients: { total: 42 },
    gamification,
    ...overrides,
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <DashboardPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Dashboard administrativo", () => {
  const periods: string[] = [];

  beforeEach(() => {
    periods.length = 0;
    mockSuccessfulLogin("Administrador");
  });

  function serve(build: (period: RankingPeriodName) => Dashboard) {
    server.use(
      http.get("/api/dashboard", ({ request }) => {
        const period = (new URL(request.url).searchParams.get("period") ??
          "week") as RankingPeriodName;
        periods.push(period);
        return HttpResponse.json(build(period));
      }),
    );
  }

  it("mostra os quatro cartões de KPI, a ocupação por aula e o ranking do mês", async () => {
    serve((period) => dashboardOf(period));
    renderPage();

    const clients = (await screen.findByText("Clientes ativos")).closest("div")!;
    expect(within(clients).getByText("42")).toBeInTheDocument();
    // 10 reservas em 20 vagas na semana (Treino Funcional 9/12 e Pilates 1/8).
    const occupancy = screen.getByText("Ocupação média da semana").closest("div")!;
    expect(within(occupancy).getByText("50%")).toBeInTheDocument();
    const points = screen.getByText("Pontos distribuídos no mês").closest("div")!;
    expect(within(points).getByText("240")).toBeInTheDocument();
    const streaks = screen.getByText("Streaks ativos").closest("div")!;
    expect(within(streaks).getByText("3")).toBeInTheDocument();

    // Uma barra por modalidade, da mais para a menos cheia: 9/12 = 75% e 1/8 = 13%.
    const bars = screen.getByRole("list", { name: "Ocupação por aula" });
    const rows = within(bars).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Treino Funcional75%", "Pilates13%"]);

    const top = screen.getByRole("list", { name: "Topo do ranking" });
    expect(within(top).getAllByRole("listitem")).toHaveLength(1);
    expect(within(top).getByText("Ana Paula Souza")).toBeInTheDocument();
    expect(within(top).getByText("9 presenças")).toBeInTheDocument();
    // O painel de gamificação mostra o período do mês (o artboard não tem seletor).
    expect(periods).toEqual(["month"]);
  });

  it("agrupa as aulas de mesmo nome e limita o ranking a três posições", async () => {
    serve((period) =>
      dashboardOf(period, {
        occupancy: {
          today: [],
          week: [
            { id: "a", name: "Yoga", startsAt: "2026-09-29T12:00:00.000Z", capacity: 10, booked: 10, availableSpots: 0 },
            { id: "b", name: "Yoga", startsAt: "2026-10-01T12:00:00.000Z", capacity: 10, booked: 8, availableSpots: 2 },
            { id: "c", name: "Muay Thai", startsAt: "2026-10-02T12:00:00.000Z", capacity: 10, booked: 4, availableSpots: 6 },
          ],
        },
        gamification: {
          pointsDistributed: 48200,
          attendances: 30,
          clientsWithActiveStreak: 0,
          top: [1, 2, 3, 4].map((position) => ({
            clientId: `c-${position}`,
            position,
            fullName: `Cliente ${position}`,
            points: 100 - position,
            attendances: position === 1 ? 1 : 2,
            tied: false,
          })),
        },
      }),
    );
    renderPage();

    const bars = await screen.findByRole("list", { name: "Ocupação por aula" });
    expect(within(bars).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Yoga90%",
      "Muay Thai40%",
    ]);
    expect(screen.getByText("48.200", { selector: ".fb-dash__figure-value" })).toBeInTheDocument();
    const top = screen.getByRole("list", { name: "Topo do ranking" });
    expect(within(top).getAllByRole("listitem")).toHaveLength(3);
    expect(within(top).getByText("1 presença")).toBeInTheDocument();
  });

  it("dois clientes empatados com o mesmo nome aparecem os dois, sem chave de lista repetida", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    serve((period) =>
      dashboardOf(period, {
        gamification: {
          pointsDistributed: 40,
          attendances: 4,
          clientsWithActiveStreak: 0,
          top: [
            { clientId: "c-1", position: 1, fullName: "Ana Souza", points: 20, attendances: 2, tied: true },
            { clientId: "c-2", position: 1, fullName: "Ana Souza", points: 20, attendances: 2, tied: true },
          ],
        },
      }),
    );
    renderPage();

    const top = await screen.findByRole("list", { name: "Topo do ranking" });
    expect(within(top).getAllByRole("listitem")).toHaveLength(2);
    const duplicateKey = errors.mock.calls.some((call) => String(call[0]).includes("same key"));
    errors.mockRestore();
    expect(duplicateKey).toBe(false);
  });

  it("não mostra os blocos que o servidor omitiu", async () => {
    serve((period) =>
      dashboardOf(period, { occupancy: null, gamification: null, activeClients: { total: 5 } }),
    );
    renderPage();

    expect(await screen.findByText("Clientes ativos")).toBeInTheDocument();
    expect(screen.queryByText("Ocupação média da semana")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ocupação por aula/)).not.toBeInTheDocument();
    expect(screen.queryByText("Gamificação")).not.toBeInTheDocument();
    expect(screen.queryByText("Streaks ativos")).not.toBeInTheDocument();
  });
});
