import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  gymDateTimeToUtc,
  type GamificationSummary,
  type PointsHistoryItem,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { GamificationPage } from "../src/pages/GamificationPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

// Quarta-feira 06/05/2026, 18h00 na academia (America/Sao_Paulo, UTC-3).
const NOW = new Date("2026-05-06T21:00:00Z");

function entry(
  id: string,
  date: string,
  time: string,
  overrides: Partial<PointsHistoryItem> = {},
): PointsHistoryItem {
  return {
    id,
    type: "ATTENDANCE",
    points: 10,
    occurredAt: gymDateTimeToUtc(date, time).toISOString(),
    subject: "Treino Funcional",
    milestone: null,
    ...overrides,
  };
}

const NO_STREAK = {
  streak: { current: 0, next: { threshold: 3, bonusPoints: 5 } },
  badges: [
    { milestone: 3, earned: false, awardedAt: null },
    { milestone: 5, earned: false, awardedAt: null },
    { milestone: 10, earned: false, awardedAt: null },
  ],
} satisfies Pick<GamificationSummary, "streak" | "badges">;

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("marina@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return (
    <Routes>
      <Route path="/gamificacao" element={<GamificationPage />} />
      <Route path="/" element={<h1>Início (tela)</h1>} />
    </Routes>
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/gamificacao"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** A linha do total de pontos (o número grande e o rótulo "pontos totais"). */
function totalRow() {
  return screen.getByText("pontos totais").parentElement!;
}

describe("Gamificação do cliente", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockSuccessfulLogin("Cliente");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockSummary(summary: GamificationSummary) {
    server.use(http.get("/api/gamification/me", () => HttpResponse.json(summary)));
  }

  it("mostra o total de pontos e o histórico dos ganhos", async () => {
    mockSummary({
      ...NO_STREAK,
      totalPoints: 1240,
      history: [
        entry("e1", "2026-05-06", "17:30"),
        entry("e2", "2026-05-05", "12:00", {
          type: "GOAL",
          points: 25,
          subject: "3 treinos na semana",
        }),
        entry("e3", "2026-05-03", "07:00", {
          type: "STREAK_BONUS",
          points: 5,
          subject: null,
          milestone: 5,
        }),
      ],
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Sua evolução" })).toBeInTheDocument();
    expect(await screen.findByText("1.240")).toBeInTheDocument();
    expect(screen.getByText("pontos totais")).toBeInTheDocument();

    const history = screen.getByRole("region", { name: "Histórico recente" });
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(
      within(items[0]).getByText("Presença confirmada · Treino Funcional"),
    ).toBeInTheDocument();
    expect(within(items[0]).getByText("Hoje, 17h30")).toBeInTheDocument();
    expect(within(items[0]).getByText("+10")).toBeInTheDocument();
    expect(within(items[1]).getByText("Meta concluída · 3 treinos na semana")).toBeInTheDocument();
    expect(within(items[1]).getByText("Ontem")).toBeInTheDocument();
    expect(within(items[1]).getByText("+25")).toBeInTheDocument();
    expect(within(items[2]).getByText("Streak de 5 dias consecutivos")).toBeInTheDocument();
    expect(within(items[2]).getByText("Há 3 dias")).toBeInTheDocument();
  });

  it("mostra as correções (estorno da presença e do bônus) com os pontos negativos", async () => {
    mockSummary({
      ...NO_STREAK,
      totalPoints: 0,
      history: [
        entry("e1", "2026-05-06", "17:30", { type: "REVERSAL", points: -5, milestone: 3 }),
        entry("e2", "2026-05-06", "17:30", { type: "REVERSAL", points: -10 }),
        entry("e3", "2026-05-06", "17:30"),
      ],
    });

    renderPage();

    const history = await screen.findByRole("region", { name: "Histórico recente" });
    const items = within(history).getAllByRole("listitem");
    expect(within(items[0]).getByText("Bônus de streak estornado · 3 dias")).toBeInTheDocument();
    expect(within(items[0]).getByText("-5")).toBeInTheDocument();
    expect(
      within(items[1]).getByText("Correção de presença · Treino Funcional"),
    ).toBeInTheDocument();
    expect(within(items[1]).getByText("-10")).toBeInTheDocument();
    expect(within(totalRow()).getByText("0")).toBeInTheDocument();
  });

  it("mostra o streak atual, os marcos alcançados e o próximo marco", async () => {
    mockSummary({
      totalPoints: 65,
      history: [],
      streak: { current: 4, next: { threshold: 5, bonusPoints: 10 } },
      badges: [
        { milestone: 3, earned: true, awardedAt: "2026-05-04T21:00:00.000Z" },
        { milestone: 5, earned: false, awardedAt: null },
        { milestone: 10, earned: false, awardedAt: null },
      ],
    });

    renderPage();

    const points = await screen.findByRole("region", { name: "Pontos" });
    expect(within(points).getByText("4")).toBeInTheDocument();
    expect(within(points).getByText("dias seguidos de treino")).toBeInTheDocument();
    expect(within(points).getByText("Próximo marco: 5 dias (+10 pontos)")).toBeInTheDocument();
    expect(within(points).getByRole("listitem", { name: "3 dias, alcançado" })).toBeInTheDocument();
    expect(
      within(points).getByRole("listitem", { name: "5 dias, ainda não alcançado" }),
    ).toBeInTheDocument();
    expect(
      within(points).getByRole("listitem", { name: "10 dias, ainda não alcançado" }),
    ).toBeInTheDocument();
  });

  it("com todos os marcos alcançados, diz que não há próximo", async () => {
    mockSummary({
      totalPoints: 135,
      history: [],
      streak: { current: 12, next: null },
      badges: [3, 5, 10].map((milestone) => ({
        milestone,
        earned: true,
        awardedAt: "2026-05-04T21:00:00.000Z",
      })),
    });

    renderPage();

    expect(await screen.findByText("Você atingiu todos os marcos.")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "10 dias, alcançado" })).toBeInTheDocument();
  });

  it("mostra os badges conquistados e os bloqueados, com o progresso destes", async () => {
    mockSummary({
      totalPoints: 35,
      history: [],
      streak: { current: 4, next: { threshold: 5, bonusPoints: 10 } },
      badges: [
        { milestone: 3, earned: true, awardedAt: "2026-05-04T21:00:00.000Z" },
        { milestone: 5, earned: false, awardedAt: null },
        { milestone: 10, earned: false, awardedAt: null },
      ],
    });

    renderPage();

    const badges = await screen.findByRole("region", { name: "Conquistas" });
    expect(
      within(badges).getByRole("listitem", { name: "Streak de 3, conquistado" }),
    ).toHaveTextContent("Streak de 3");
    expect(
      within(badges).getByRole("listitem", { name: "Streak de 5 (4/5), bloqueado" }),
    ).toHaveTextContent("Streak de 5 (4/5)");
    expect(
      within(badges).getByRole("listitem", { name: "Streak de 10 (4/10), bloqueado" }),
    ).toBeInTheDocument();
  });

  it("sem marcos configurados não mostra streak nem conquistas", async () => {
    mockSummary({
      totalPoints: 0,
      history: [],
      streak: { current: 0, next: null },
      badges: [],
    });

    renderPage();

    await screen.findByText("Nenhum ganho de pontos ainda.");
    expect(screen.queryByRole("region", { name: "Conquistas" })).not.toBeInTheDocument();
    expect(screen.queryByText("dias seguidos de treino")).not.toBeInTheDocument();
  });

  it("quem ainda não tem pontos vê zero e o estado vazio do histórico", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 0, history: [] });

    renderPage();

    expect(await screen.findByText("Nenhum ganho de pontos ainda.")).toBeInTheDocument();
    expect(within(totalRow()).getByText("0")).toBeInTheDocument();
  });

  it("avisa quando a evolução não carrega", async () => {
    server.use(
      http.get("/api/gamification/me", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar sua evolução.",
    );
  });

  it("o botão Voltar leva para o início", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 0, history: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nenhum ganho de pontos ainda.");

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(await screen.findByRole("heading", { name: "Início (tela)" })).toBeInTheDocument();
  });
});
