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
    ...overrides,
  };
}

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
      totalPoints: 1240,
      history: [
        entry("e1", "2026-05-06", "17:30"),
        entry("e2", "2026-05-05", "12:00", {
          type: "GOAL",
          points: 25,
          subject: "3 treinos na semana",
        }),
        entry("e3", "2026-05-03", "07:00", { type: "STREAK_BONUS", points: 5, subject: null }),
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
    expect(within(items[2]).getByText("Bônus de streak")).toBeInTheDocument();
    expect(within(items[2]).getByText("Há 3 dias")).toBeInTheDocument();
  });

  it("mostra a correção de presença com os pontos negativos", async () => {
    mockSummary({
      totalPoints: 0,
      history: [
        entry("e1", "2026-05-06", "17:30", { type: "REVERSAL", points: -10 }),
        entry("e2", "2026-05-06", "17:30"),
      ],
    });

    renderPage();

    const history = await screen.findByRole("region", { name: "Histórico recente" });
    const items = within(history).getAllByRole("listitem");
    expect(
      within(items[0]).getByText("Correção de presença · Treino Funcional"),
    ).toBeInTheDocument();
    expect(within(items[0]).getByText("-10")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("quem ainda não tem pontos vê zero e o estado vazio do histórico", async () => {
    mockSummary({ totalPoints: 0, history: [] });

    renderPage();

    expect(await screen.findByText("Nenhum ganho de pontos ainda.")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
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
    mockSummary({ totalPoints: 0, history: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nenhum ganho de pontos ainda.");

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(await screen.findByRole("heading", { name: "Início (tela)" })).toBeInTheDocument();
  });
});
