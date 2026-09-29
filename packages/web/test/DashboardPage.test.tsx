import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
            { position: 1, fullName: "Bruno Alves", points: 35, attendances: 1, tied: false },
            { position: 2, fullName: "Ana Paula Souza", points: 20, attendances: 2, tied: false },
          ],
        }
      : {
          pointsDistributed: 240,
          attendances: 18,
          clientsWithActiveStreak: 3,
          top: [
            { position: 1, fullName: "Ana Paula Souza", points: 120, attendances: 9, tied: false },
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

  it("mostra ocupação e vagas, clientes ativos e os indicadores da semana", async () => {
    serve((period) => dashboardOf(period));
    renderPage();

    const today = await screen.findByRole("list", { name: "Aulas de hoje" });
    const funcional = within(today).getByText("Treino Funcional").closest("li")!;
    expect(within(funcional).getByText("9/12")).toBeInTheDocument();
    expect(within(funcional).getByText("3 vagas")).toBeInTheDocument();
    const yoga = within(today).getByText("Yoga").closest("li")!;
    expect(within(yoga).getByText("Lotada")).toBeInTheDocument();

    expect(screen.getByText("Pilates")).toBeInTheDocument();
    expect(screen.getByText("clientes ativos").previousSibling).toHaveTextContent("42");
    expect(screen.getByText("pontos distribuídos").previousSibling).toHaveTextContent("65");
    expect(screen.getByText("presenças").previousSibling).toHaveTextContent("4");
    expect(screen.getByText("clientes com streak ativo").previousSibling).toHaveTextContent("1");

    const top = screen.getByRole("list", { name: "Topo do ranking" });
    expect(within(top).getAllByRole("listitem")).toHaveLength(2);
    expect(within(top).getByText("Bruno Alves")).toBeInTheDocument();
    expect(periods).toEqual(["week"]);
  });

  it("alterna os indicadores entre semana e mês", async () => {
    serve((period) => dashboardOf(period));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("pontos distribuídos");
    await user.click(screen.getByRole("button", { name: "Mês" }));

    expect(await screen.findByText("240")).toBeInTheDocument();
    expect(screen.getByText("pontos distribuídos").previousSibling).toHaveTextContent("240");
    expect(screen.getByText("clientes com streak ativo").previousSibling).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Mês" })).toHaveAttribute("aria-pressed", "true");
    expect(periods).toEqual(["week", "month"]);
  });

  it("não mostra os blocos que o servidor omitiu", async () => {
    serve((period) =>
      dashboardOf(period, { occupancy: null, gamification: null, activeClients: { total: 5 } }),
    );
    renderPage();

    expect(await screen.findByText("clientes ativos")).toBeInTheDocument();
    expect(screen.queryByText("Ocupação das aulas")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamificação")).not.toBeInTheDocument();
  });
});
