import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  gymDateTimeToUtc,
  type GamificationSummary,
  type GoalDetail,
  type PointsHistoryItem,
  type Ranking,
  type RankingEntry,
  type RankingPeriodName,
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

function rankingEntry(
  position: number,
  name: string,
  attendances: number,
  overrides: Partial<RankingEntry> = {},
): RankingEntry {
  return {
    position,
    name,
    firstName: name.split(" ")[0],
    points: attendances * 10,
    attendances,
    tied: false,
    isMe: false,
    ...overrides,
  };
}

function rankingOf(period: RankingPeriodName, entries: RankingEntry[]): Ranking {
  return period === "week"
    ? { period, from: "2026-05-04", to: "2026-05-10", entries }
    : { period, from: "2026-05-01", to: "2026-05-31", entries };
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
  const rankingRequests: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockSuccessfulLogin("Cliente");
    rankingRequests.length = 0;
    mockRanking({ week: [], month: [] });
    mockGoals([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockGoals(goals: GoalDetail[]) {
    server.use(http.get("/api/goals/mine", () => HttpResponse.json(goals)));
  }

  /** O ranking de cada período; registra qual período cada consulta pediu. */
  function mockRanking(entries: Record<RankingPeriodName, RankingEntry[]>) {
    server.use(
      http.get("/api/gamification/ranking", ({ request }) => {
        const period = (new URL(request.url).searchParams.get("period") ??
          "week") as RankingPeriodName;
        rankingRequests.push(period);
        return HttpResponse.json(rankingOf(period, entries[period]));
      }),
    );
  }

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

  it("mostra só os 3 ganhos mais recentes, como o artboard", async () => {
    mockSummary({
      ...NO_STREAK,
      totalPoints: 40,
      history: ["e1", "e2", "e3", "e4", "e5"].map((id) => entry(id, "2026-05-06", "17:30")),
    });

    renderPage();

    const history = await screen.findByRole("region", { name: "Histórico recente" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(3);
  });

  it("com todos os marcos alcançados, não mostra a linha de próximo marco", async () => {
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

    expect(await screen.findByRole("listitem", { name: "10 dias, alcançado" })).toBeInTheDocument();
    expect(screen.queryByText(/Próximo marco/)).not.toBeInTheDocument();
    expect(screen.queryByText("Você atingiu todos os marcos.")).not.toBeInTheDocument();
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

  it("mostra o ranking semanal com a minha posição destacada e o rótulo de empate", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 50, history: [] });
    mockRanking({
      week: [
        rankingEntry(1, "Ana P.", 6),
        rankingEntry(2, "Marina M.", 5, { tied: true, isMe: true }),
        rankingEntry(2, "Bruno A.", 5, { tied: true }),
        rankingEntry(4, "Camila D.", 4),
        rankingEntry(5, "Diego R.", 1),
      ],
      month: [],
    });

    renderPage();

    const ranking = await screen.findByRole("region", { name: "Ranking" });
    expect(await within(ranking).findByText("Ana P.")).toBeInTheDocument();
    expect(rankingRequests).toEqual(["week"]);
    expect(within(ranking).getByRole("button", { name: "Semanal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const rows = within(ranking).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText("1º")).toBeInTheDocument();
    expect(within(rows[0]).getByText("6 presenças")).toBeInTheDocument();
    // A minha linha: só o primeiro nome com "(você)", destacada, e o rótulo de empate.
    expect(within(rows[1]).getByText("Marina (você)")).toBeInTheDocument();
    expect(within(rows[1]).getByText("5 presenças · empate")).toBeInTheDocument();
    expect(rows[1]).toHaveClass("fb-gami__rank-row--me");
    expect(rows[0]).not.toHaveClass("fb-gami__rank-row--me");
    expect(within(rows[2]).getByText("2º")).toBeInTheDocument();
    expect(within(rows[2]).getByText("5 presenças · empate")).toBeInTheDocument();
    expect(within(rows[3]).getByText("4º")).toBeInTheDocument();
    expect(within(rows[3]).queryByText(/empate/)).not.toBeInTheDocument();
    expect(within(rows[4]).getByText("1 presença")).toBeInTheDocument();
  });

  it("troca para o ranking mensal", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 0, history: [] });
    mockRanking({
      week: [rankingEntry(1, "Ana P.", 2)],
      month: [rankingEntry(1, "Bruno A.", 9), rankingEntry(2, "Ana P.", 7)],
    });
    const user = userEvent.setup();
    renderPage();
    const ranking = await screen.findByRole("region", { name: "Ranking" });
    await within(ranking).findByText("Ana P.");

    await user.click(within(ranking).getByRole("button", { name: "Mensal" }));

    expect(await within(ranking).findByText("Bruno A.")).toBeInTheDocument();
    expect(within(ranking).getByText("9 presenças")).toBeInTheDocument();
    expect(within(ranking).getByRole("button", { name: "Mensal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rankingRequests).toEqual(["week", "month"]);
  });

  it("quem está fora dos primeiros aparece com a posição real, destacado", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 10, history: [] });
    mockRanking({
      week: [rankingEntry(1, "Ana P.", 9), rankingEntry(12, "Marina M.", 1, { isMe: true })],
      month: [],
    });

    renderPage();

    const ranking = await screen.findByRole("region", { name: "Ranking" });
    const mine = (await within(ranking).findByText("Marina (você)")).closest("li")!;
    expect(within(mine).getByText("12º")).toBeInTheDocument();
    expect(mine).toHaveClass("fb-gami__rank-row--me");
  });

  it("período sem ninguém pontuando mostra o estado vazio; falha do ranking avisa", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 0, history: [] });
    const user = userEvent.setup();
    renderPage();
    const ranking = await screen.findByRole("region", { name: "Ranking" });
    expect(
      await within(ranking).findByText("Ninguém pontuou neste período ainda."),
    ).toBeInTheDocument();

    server.use(
      http.get("/api/gamification/ranking", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );
    await user.click(within(ranking).getByRole("button", { name: "Mensal" }));

    expect(await within(ranking).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o ranking.",
    );
  });

  it("mostra as metas do professor: a ativa com o prazo e a concluída", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 25, history: [] });
    mockGoals([
      {
        id: "g-1",
        clientId: "c-1",
        title: "Treinar 4x por semana",
        description: "Sem faltar",
        dueDate: "2026-05-30",
        status: "ACTIVE",
        concludedAt: null,
        createdAt: "2026-05-01T12:00:00.000Z",
      },
      {
        id: "g-2",
        clientId: "c-1",
        title: "Completar 12 aulas no mês",
        description: null,
        dueDate: null,
        status: "COMPLETED",
        concludedAt: "2026-05-04T21:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
      },
    ]);

    renderPage();

    const goals = await screen.findByRole("region", { name: "Metas do professor" });
    const items = await within(goals).findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Treinar 4x por semana")).toBeInTheDocument();
    expect(within(items[0]).getByText("Prazo: 30/05/2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("Sem faltar")).toBeInTheDocument();
    expect(within(items[1]).getByText("Completar 12 aulas no mês")).toBeInTheDocument();
    expect(within(items[1]).getByText("Concluída em 04/05/2026")).toBeInTheDocument();
    expect(items[1]).toHaveClass("fb-gami__goal--done");
  });

  it("sem metas mostra o estado vazio", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 0, history: [] });
    renderPage();
    const goals = await screen.findByRole("region", { name: "Metas do professor" });
    expect(await within(goals).findByText("Nenhuma meta no momento.")).toBeInTheDocument();
  });

  it("avisa quando as metas não carregam", async () => {
    mockSummary({ ...NO_STREAK, totalPoints: 0, history: [] });
    server.use(
      http.get("/api/goals/mine", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );
    renderPage();

    const goals = await screen.findByRole("region", { name: "Metas do professor" });

    expect(await within(goals).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as metas.",
    );
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
