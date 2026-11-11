import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
  gymToday,
  type ClientAgendaItem,
  type GamificationSummary,
  type MyPlan,
  type Ranking,
  type ReservationDetail,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientHomePage } from "../src/pages/ClientHomePage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const TODAY = gymToday();

const ACTIVE_PLAN: MyPlan = {
  active: {
    id: "a-1",
    plan: { id: "plan-1", name: "Plano Performance", description: "Acesso a tudo." },
    startDate: "2026-08-15",
    endDate: "2026-11-15",
    status: "ACTIVE",
  },
  history: [],
};

const NO_PLAN: MyPlan = { active: null, history: [] };

function reservation(
  id: string,
  date: string,
  time: string,
  name = "Treino Funcional",
): ReservationDetail {
  const startsAt = gymDateTimeToUtc(date, time);
  return {
    id,
    status: "CONFIRMED",
    occurrence: {
      id: `occ-${id}`,
      name,
      modality: { id: "mod-1", name },
      instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: "SCHEDULED",
    },
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
}

const EMPTY_GAMIFICATION: GamificationSummary = {
  totalPoints: 0,
  history: [],
  streak: { current: 0, next: { threshold: 3, bonusPoints: 5 } },
  badges: [
    { milestone: 3, earned: false, awardedAt: null },
    { milestone: 7, earned: false, awardedAt: null },
  ],
};

const ACTIVE_GAMIFICATION: GamificationSummary = {
  totalPoints: 1240,
  history: [
    {
      id: "h-1",
      type: "ATTENDANCE",
      points: 10,
      occurredAt: "2026-09-28T21:00:00.000Z",
      subject: "Treino Funcional",
      milestone: null,
    },
  ],
  streak: { current: 12, next: { threshold: 14, bonusPoints: 20 } },
  badges: [
    { milestone: 3, earned: true, awardedAt: "2026-09-10T12:00:00.000Z" },
    { milestone: 7, earned: true, awardedAt: "2026-09-20T12:00:00.000Z" },
    { milestone: 14, earned: false, awardedAt: null },
  ],
};

function weeklyRanking(myPosition: number | null): Ranking {
  return {
    period: "week",
    from: "2026-09-28",
    to: "2026-10-04",
    entries:
      myPosition === null
        ? [
            {
              position: 1,
              name: "Ana P.",
              firstName: "Ana",
              points: 50,
              attendances: 5,
              tied: false,
              isMe: false,
            },
          ]
        : [
            {
              position: myPosition,
              name: "Usuário T.",
              firstName: "Usuário",
              points: 30,
              attendances: 3,
              tied: false,
              isMe: true,
            },
          ],
  };
}

interface Scenario {
  plan?: MyPlan;
  reservations?: ReservationDetail[];
  gamification?: GamificationSummary;
  ranking?: Ranking;
  rankingConsent?: boolean;
}

function mockHome({
  plan = NO_PLAN,
  reservations = [],
  gamification = EMPTY_GAMIFICATION,
  ranking = weeklyRanking(null),
  rankingConsent = true,
}: Scenario = {}) {
  server.use(
    http.get("/api/plans/mine", () => HttpResponse.json(plan)),
    http.get("/api/reservations", () => HttpResponse.json(reservations)),
    http.get("/api/gamification/me", () => HttpResponse.json(gamification)),
    http.get("/api/gamification/ranking/consent", () =>
      HttpResponse.json({ consented: rankingConsent, manifestation: null }),
    ),
    http.get("/api/gamification/ranking", () => HttpResponse.json(ranking)),
  );
}

/** Conta as chamadas a /api/plans/mine: o Início não pode mais pedir o plano (D-043). */
function trackPlanRequests(): () => number {
  let count = 0;
  server.use(
    http.get("/api/plans/mine", () => {
      count += 1;
      return HttpResponse.json(NO_PLAN);
    }),
  );
  return () => count;
}

function AgendaProbe() {
  const location = useLocation();
  const state = location.state as { rescheduling?: { reservationId: string } } | null;
  return (
    <h1>
      Agenda (tela){state?.rescheduling ? ` remarcando ${state.rescheduling.reservationId}` : ""}
    </h1>
  );
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
      <Route path="/" element={<ClientHomePage />} />
      <Route path="/agenda" element={<AgendaProbe />} />
      <Route path="/plano" element={<h1>Plano (tela)</h1>} />
      <Route path="/ficha-treino" element={<h1>Ficha de treino (tela)</h1>} />
      <Route path="/perfil" element={<h1>Perfil (tela)</h1>} />
      <Route path="/fitpoints" element={<h1>Gamificação (tela)</h1>} />
    </Routes>
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Home do cliente", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  describe("saudação", () => {
    it("cumprimenta o cliente pelo primeiro nome", async () => {
      mockHome();
      renderPage();

      expect(await screen.findByRole("heading", { name: "Olá, Usuário" })).toBeInTheDocument();
    });
  });

  describe("sem o cartão do plano (D-043)", () => {
    it("com plano ativo não mostra cartão nem pede o plano à API", async () => {
      const planRequests = trackPlanRequests();
      mockHome({ plan: ACTIVE_PLAN });
      renderPage();

      await screen.findByRole("heading", { name: "Olá, Usuário" });
      await screen.findByRole("region", { name: "FitPoints" });
      expect(screen.queryByRole("region", { name: "Plano ativo" })).not.toBeInTheDocument();
      expect(screen.queryByText("Plano Performance")).not.toBeInTheDocument();
      expect(screen.queryByText("ATIVO")).not.toBeInTheDocument();
      expect(screen.queryByText(/Ativo até/)).not.toBeInTheDocument();
      expect(planRequests()).toBe(0);
    });

    it("com plano de início futuro também não mostra 'Próximo plano'", async () => {
      const planRequests = trackPlanRequests();
      mockHome({
        plan: {
          active: { ...ACTIVE_PLAN.active!, startDate: "2099-01-10", endDate: "2099-06-10" },
          history: [],
        },
      });
      renderPage();

      await screen.findByRole("region", { name: "FitPoints" });
      expect(screen.queryByText("Próximo plano")).not.toBeInTheDocument();
      expect(screen.queryByText(/Começa em/)).not.toBeInTheDocument();
      expect(planRequests()).toBe(0);
    });

    it("sem plano não mostra o aviso de sem plano nem pede o plano à API", async () => {
      const planRequests = trackPlanRequests();
      mockHome({ plan: NO_PLAN });
      renderPage();

      await screen.findByRole("region", { name: "FitPoints" });
      expect(screen.queryByText(/Você ainda não tem um plano ativo/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Fale com a recepção/)).not.toBeInTheDocument();
      expect(planRequests()).toBe(0);
    });
  });

  describe("próximas reservas", () => {
    it("lista as reservas confirmadas com aula, horário e professor", async () => {
      mockHome({
        reservations: [
          reservation("r-1", addDays(TODAY, 1), "18:00"),
          reservation("r-2", addDays(TODAY, 2), "07:00", "Spinning"),
        ],
      });
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      const items = await within(section).findAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Treino Funcional");
      expect(items[0]).toHaveTextContent("18h00 · Prof. Rafael");
      expect(items[0]).not.toHaveTextContent("Andrade");
      expect(items[1]).toHaveTextContent("Spinning");
    });

    it("pede só as próximas reservas confirmadas", async () => {
      const queries: URLSearchParams[] = [];
      mockHome();
      server.use(
        http.get("/api/reservations", ({ request }) => {
          queries.push(new URL(request.url).searchParams);
          return HttpResponse.json([]);
        }),
      );
      renderPage();

      await screen.findByRole("region", { name: "Próximas aulas" });
      await waitFor(() => expect(queries).toHaveLength(1));
      expect(queries[0].get("when")).toBe("upcoming");
      expect(queries[0].get("status")).toBe("CONFIRMED");
    });

    it("mostra no máximo três reservas", async () => {
      mockHome({
        reservations: [1, 2, 3, 4].map((n) => reservation(`r-${n}`, addDays(TODAY, n), "18:00")),
      });
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      expect(await within(section).findAllByRole("listitem")).toHaveLength(3);
    });

    it("sem reservas mostra o estado vazio com atalho para reservar na agenda", async () => {
      const user = userEvent.setup();
      mockHome({ reservations: [] });
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      expect(
        await within(section).findByText("Você não tem aulas reservadas."),
      ).toBeInTheDocument();

      await user.click(within(section).getByRole("link", { name: "Reservar uma aula" }));
      expect(await screen.findByRole("heading", { name: /Agenda \(tela\)/ })).toBeInTheDocument();
    });

    it("o atalho Ver agenda leva à agenda", async () => {
      const user = userEvent.setup();
      mockHome({ reservations: [reservation("r-1", addDays(TODAY, 1), "18:00")] });
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      await within(section).findByRole("listitem");
      await user.click(within(section).getByRole("link", { name: /^Ver agenda/ }));

      expect(await screen.findByRole("heading", { name: /Agenda \(tela\)/ })).toBeInTheDocument();
    });

    it("cancela a reserva depois de confirmar e atualiza a lista", async () => {
      const user = userEvent.setup();
      let cancelled = false;
      const cancelRequests: string[] = [];
      mockHome();
      server.use(
        http.get("/api/reservations", () =>
          HttpResponse.json(cancelled ? [] : [reservation("r-1", addDays(TODAY, 1), "18:00")]),
        ),
        http.post("/api/reservations/:id/cancel", ({ params }) => {
          cancelRequests.push(String(params.id));
          cancelled = true;
          return HttpResponse.json({
            ...reservation("r-1", addDays(TODAY, 1), "18:00"),
            status: "CANCELLED",
            cancelledAt: new Date().toISOString(),
          });
        }),
      );
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      await within(section).findByRole("listitem");

      await user.click(within(section).getByRole("button", { name: "Cancelar" }));
      // Pede confirmação antes de cancelar de fato.
      expect(cancelRequests).toEqual([]);
      await user.click(within(section).getByRole("button", { name: "Confirmar cancelamento" }));

      expect(
        await within(section).findByText("Você não tem aulas reservadas."),
      ).toBeInTheDocument();
      expect(cancelRequests).toEqual(["r-1"]);
    });

    it("voltar na confirmação mantém a reserva", async () => {
      const user = userEvent.setup();
      mockHome({ reservations: [reservation("r-1", addDays(TODAY, 1), "18:00")] });
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      await within(section).findByRole("listitem");
      await user.click(within(section).getByRole("button", { name: "Cancelar" }));
      await user.click(within(section).getByRole("button", { name: "Voltar" }));

      expect(within(section).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
      expect(
        within(section).queryByRole("button", { name: "Confirmar cancelamento" }),
      ).not.toBeInTheDocument();
    });

    it("avisa quando o cancelamento é recusado", async () => {
      const user = userEvent.setup();
      mockHome({ reservations: [reservation("r-1", addDays(TODAY, 1), "18:00")] });
      server.use(
        http.post("/api/reservations/:id/cancel", () =>
          HttpResponse.json(
            { code: "OCCURRENCE_NOT_BOOKABLE", message: "A aula já começou." },
            { status: 422 },
          ),
        ),
      );
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      await within(section).findByRole("listitem");
      await user.click(within(section).getByRole("button", { name: "Cancelar" }));
      await user.click(within(section).getByRole("button", { name: "Confirmar cancelamento" }));

      expect(await within(section).findByRole("alert")).toHaveTextContent("A aula já começou.");
    });

    it("Remarcar leva à agenda já em modo de remarcação da reserva", async () => {
      const user = userEvent.setup();
      const startsAt = gymDateTimeToUtc(addDays(TODAY, 1), "18:00");
      const item: ClientAgendaItem = {
        id: "occ-r-1",
        name: "Treino Funcional",
        description: null,
        modality: { id: "mod-1", name: "Treino Funcional" },
        instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        durationMinutes: 60,
        capacity: 10,
        available: 4,
        myReservationId: "r-1",
      };
      mockHome({ reservations: [reservation("r-1", addDays(TODAY, 1), "18:00")] });
      server.use(http.get("/api/agenda/:id", () => HttpResponse.json(item)));
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      await within(section).findByRole("listitem");
      await user.click(within(section).getByRole("button", { name: "Remarcar" }));

      expect(
        await screen.findByRole("heading", { name: "Agenda (tela) remarcando r-1" }),
      ).toBeInTheDocument();
    });
  });

  describe("resumo da gamificação", () => {
    it("mostra pontos, streak, posição semanal e os badges mais recentes", async () => {
      mockHome({ gamification: ACTIVE_GAMIFICATION, ranking: weeklyRanking(8) });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      expect(await within(section).findByText("1.240")).toBeInTheDocument();
      expect(within(section).getByText("12")).toBeInTheDocument();
      expect(within(section).getByText("dias seguidos de treino")).toBeInTheDocument();
      expect(await within(section).findByText("8º lugar no ranking semanal")).toBeInTheDocument();
      // Uma fileira de discos (até três), do mais novo para o mais antigo.
      const badges = within(section).getAllByRole("listitem");
      expect(badges).toHaveLength(2);
      expect(within(badges[0]).getByRole("img", { name: "Streak de 7 dias" })).toBeInTheDocument();
      expect(within(badges[1]).getByRole("img", { name: "Streak de 3 dias" })).toBeInTheDocument();
    });

    it("mostra no máximo três badges recentes", async () => {
      mockHome({
        gamification: {
          ...ACTIVE_GAMIFICATION,
          badges: [3, 5, 7, 10].map((milestone, index) => ({
            milestone,
            earned: true,
            awardedAt: `2026-09-${10 + index}T12:00:00.000Z`,
          })),
        },
        ranking: weeklyRanking(8),
      });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      const badges = await within(section).findAllByRole("listitem");
      expect(badges.map((badge) => within(badge).getByRole("img").getAttribute("aria-label"))).toEqual([
        "Streak de 10 dias",
        "Streak de 7 dias",
        "Streak de 5 dias",
      ]);
    });

    it("o link leva à tela completa de gamificação", async () => {
      const user = userEvent.setup();
      mockHome({ gamification: ACTIVE_GAMIFICATION, ranking: weeklyRanking(8) });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      await user.click(await within(section).findByRole("link", { name: "Ver FitPoints" }));

      expect(
        await screen.findByRole("heading", { name: "Gamificação (tela)" }),
      ).toBeInTheDocument();
    });

    it("sem badge conquistado, diz que ainda não há nenhum", async () => {
      mockHome({
        gamification: { ...ACTIVE_GAMIFICATION, streak: { current: 1, next: null }, badges: [] },
        ranking: weeklyRanking(8),
      });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      expect(
        await within(section).findByText("Nenhum badge conquistado ainda."),
      ).toBeInTheDocument();
    });

    it("sem pontos mostra o estado vazio em vez de zeros", async () => {
      mockHome({ gamification: EMPTY_GAMIFICATION, ranking: weeklyRanking(null) });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      expect(
        await within(section).findByText(
          "Você ainda não tem pontos. Reserve uma aula e confirme sua presença para começar a pontuar.",
        ),
      ).toBeInTheDocument();
      expect(within(section).queryByText("dias seguidos de treino")).not.toBeInTheDocument();
    });

    it("com pontos mas fora do ranking da semana, avisa que ainda não pontuou nela", async () => {
      mockHome({ gamification: ACTIVE_GAMIFICATION, ranking: weeklyRanking(null) });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      expect(
        await within(section).findByText("Você ainda não pontuou no ranking desta semana."),
      ).toBeInTheDocument();
    });

    it("mantém os FitPoints e oculta posição quando não participa do ranking", async () => {
      mockHome({
        gamification: ACTIVE_GAMIFICATION,
        ranking: weeklyRanking(null),
        rankingConsent: false,
      });
      renderPage();

      const section = await screen.findByRole("region", { name: "FitPoints" });
      expect(await within(section).findByText("1.240")).toBeInTheDocument();
      expect(
        within(section).getByText(
          "Você não participa do ranking. Seus FitPoints continuam visíveis só para você.",
        ),
      ).toBeInTheDocument();
      expect(within(section).queryByText(/lugar no ranking semanal/)).not.toBeInTheDocument();
    });
  });

  it("não tem o bloco de atalhos (o design não o tem: a navegação fica na casca)", async () => {
    mockHome();
    renderPage();

    await screen.findByRole("heading", { name: "Olá, Usuário" });
    expect(screen.queryByRole("navigation", { name: "Atalhos" })).not.toBeInTheDocument();
  });

  it("mostra erro em cada bloco que não carrega, sem derrubar os outros", async () => {
    mockHome();
    server.use(
      http.get("/api/reservations", () =>
        HttpResponse.json({ code: "X", message: "x" }, { status: 500 }),
      ),
      http.get("/api/gamification/me", () =>
        HttpResponse.json({ code: "X", message: "x" }, { status: 500 }),
      ),
    );
    renderPage();

    expect(await screen.findByText("Não foi possível carregar suas reservas.")).toBeInTheDocument();
    expect(await screen.findByText("Não foi possível carregar seus FitPoints.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Olá, Usuário" })).toBeInTheDocument();
  });
});

describe("Home do cliente: visual e estados (D-038)", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  describe("saudação", () => {
    it("mostra o kicker da data acima do título, com um só título de nível 1", async () => {
      mockHome();
      renderPage();

      const heading = await screen.findByRole("heading", { level: 1, name: "Olá, Usuário" });
      const kicker = heading.parentElement?.querySelector(".fb-kicker");
      // "Terça, 10 de novembro": dia da semana, dia e mês por extenso.
      expect(kicker?.textContent).toMatch(/^[A-Za-zçÇ]+, \d{1,2} de [a-zç]+$/);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("os títulos de seção são de nível 2, depois do título da tela", async () => {
      mockHome({ gamification: ACTIVE_GAMIFICATION, ranking: weeklyRanking(8) });
      renderPage();

      await screen.findByText("1.240");
      const levels = screen.getAllByRole("heading").map((h) => [h.tagName, h.textContent]);
      expect(levels).toEqual([
        ["H1", "Olá, Usuário"],
        ["H2", "Próximas aulas"],
        ["H2", "FitPoints"],
      ]);
    });
  });

  describe("item de aula", () => {
    it("mostra modalidade, horário, professor e a situação da reserva", async () => {
      mockHome({ reservations: [reservation("r-1", addDays(TODAY, 1), "18:00")] });
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      const item = await within(section).findByRole("listitem");
      expect(within(item).getByText("Treino Funcional")).toBeInTheDocument();
      expect(item).toHaveTextContent("18h00 · Prof. Rafael");
      expect(within(item).getByText("Confirmada")).toBeInTheDocument();
    });
  });

  describe("carregando", () => {
    it("cada bloco mostra o seu próprio carregando enquanto a resposta não chega", async () => {
      server.use(
        http.get("/api/reservations", () => new Promise(() => {})),
        http.get("/api/gamification/me", () => new Promise(() => {})),
        http.get("/api/gamification/ranking/consent", () => new Promise(() => {})),
      );
      renderPage();

      expect(await screen.findByText("Carregando suas aulas…")).toBeInTheDocument();
      expect(screen.getByText("Carregando seus FitPoints…")).toBeInTheDocument();
      expect(screen.queryByText(/Carregando seu plano/)).not.toBeInTheDocument();
      for (const status of screen.getAllByRole("status")) {
        expect(status).toHaveAttribute("aria-busy", "true");
      }
      // O título da tela já está lá, sem esperar os dados.
      expect(screen.getByRole("heading", { level: 1, name: "Olá, Usuário" })).toBeInTheDocument();
    });
  });

  describe("vazio", () => {
    it("sem aulas e sem pontos mostra os dois vazios, sem zeros nem ofertas", async () => {
      mockHome({ reservations: [], gamification: EMPTY_GAMIFICATION });
      renderPage();

      const empties = await waitFor(() => {
        const found = document.querySelectorAll('[data-state="empty"]');
        expect(found).toHaveLength(2);
        return Array.from(found).map((node) => node.textContent);
      });
      expect(empties[0]).toContain("Você não tem aulas reservadas.");
      expect(empties[1]).toContain("Você ainda não tem pontos.");
      expect(screen.queryByText(/plano ativo/i)).not.toBeInTheDocument();
    });
  });

  describe("erro", () => {
    it("o erro é anunciado como alerta e 'Tentar novamente' busca de novo só aquele bloco", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      mockHome();
      server.use(
        http.get("/api/reservations", () => {
          attempts += 1;
          return attempts === 1
            ? HttpResponse.json({ code: "X", message: "x" }, { status: 500 })
            : HttpResponse.json([reservation("r-1", addDays(TODAY, 1), "18:00")]);
        }),
      );
      renderPage();

      const section = await screen.findByRole("region", { name: "Próximas aulas" });
      const alert = await within(section).findByRole("alert");
      expect(alert).toHaveTextContent("Não foi possível carregar suas reservas.");

      await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

      expect(await within(section).findByRole("listitem")).toHaveTextContent("Treino Funcional");
      expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("sem conexão", () => {
    it("sem rede, cada bloco mostra o estado offline em vez de ficar em branco", async () => {
      onlineManager.setOnline(false);
      mockHome();
      renderPage();

      const offline = await waitFor(() => {
        const found = document.querySelectorAll('[data-state="offline"]');
        expect(found).toHaveLength(2);
        return Array.from(found);
      });
      for (const node of offline) {
        expect(node).toHaveTextContent("Sem conexão");
        expect(within(node as HTMLElement).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
      }
      expect(screen.getByRole("heading", { level: 1, name: "Olá, Usuário" })).toBeInTheDocument();
    });

    it("quando a rede volta, os blocos carregam sozinhos", async () => {
      onlineManager.setOnline(false);
      mockHome();
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-state="offline"]')).toHaveLength(2));

      onlineManager.setOnline(true);

      expect(await screen.findByText("Você não tem aulas reservadas.")).toBeInTheDocument();
      expect(document.querySelectorAll('[data-state="offline"]')).toHaveLength(0);
    });
  });
});
