import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
  startOfWeek,
  weekdayOf,
  type ClientAgendaItem,
  type ReservationDetail,
} from "@fitburn/contracts";
import { formatDayLabel } from "../src/lib/agenda/format";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientAgendaPage } from "../src/pages/ClientAgendaPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

/**
 * Relógio fixo: quarta-feira, 5h na academia (antes de qualquer aula do dia). Só `Date` é falseado, para não
 * travar MSW, React Query e user-event. "Só daqui para frente" depende do agora, então os testes não podem usar o relógio real.
 */
const TODAY = "2026-11-11";
const NOW = gymDateTimeToUtc(TODAY, "05:00");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});
const WEEK_START = startOfWeek(TODAY);
const OTHER_DAY = addDays(TODAY, 1);

function item(
  date: string,
  time: string,
  overrides: Partial<ClientAgendaItem> = {},
): ClientAgendaItem {
  const startsAt = gymDateTimeToUtc(date, time);
  return {
    id: `occ-${date}-${time}`,
    name: "Treino Funcional",
    description: "Circuito com estímulos de força e resistência.",
    modality: { id: "mod-1", name: "Treino Funcional" },
    instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    capacity: 12,
    available: 9,
    myReservationId: null,
    ...overrides,
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("cliente@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <ClientAgendaPage />;
}

/** Expõe o state e a query da rota atual: a remarcação não sobrevive no histórico, e a aba vive na URL. */
function LocationState() {
  const { state, search } = useLocation();
  return (
    <>
      <output aria-label="state da rota">{JSON.stringify(state ?? null)}</output>
      <output aria-label="query da rota">{search}</output>
    </>
  );
}

/** Os testes da grade e da remarcação abrem a aba Todas; os de Suas aulas passam `/agenda`. */
function renderPage(state?: unknown, path = "/agenda?aba=todas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}>
          <LoggedInPage />
          <LocationState />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function reservation(
  id: string,
  date: string,
  time: string,
  overrides: { name?: string; instructor?: string } = {},
): ReservationDetail {
  const startsAt = gymDateTimeToUtc(date, time);
  const name = overrides.name ?? "Treino Funcional";
  return {
    id,
    status: "CONFIRMED",
    occurrence: {
      id: `occ-${id}`,
      name,
      modality: { id: "mod-1", name },
      instructor: { id: "user-rafael", fullName: overrides.instructor ?? "Rafael Andrade" },
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: "SCHEDULED",
    },
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
}

/** Botão do controle "Visão": "Todas" também é o nome da pílula de modalidade. */
const viewButton = (name: string) =>
  within(screen.getByRole("group", { name: "Visão" })).getByRole("button", { name });

describe("ClientAgendaPage › abas Suas aulas | Todas", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
    server.use(http.get("/api/agenda", () => HttpResponse.json([item(TODAY, "07:00")])));
  });

  function useReservations(reservations: ReservationDetail[], requests: URLSearchParams[] = []) {
    server.use(
      http.get("/api/reservations", ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(reservations);
      }),
    );
  }

  it("abre em Suas aulas quando a URL não tem aba", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")]);
    renderPage(undefined, "/agenda");

    const view = await screen.findByRole("group", { name: "Visão" });
    expect(within(view).getByRole("button", { name: "Suas aulas" })).toHaveAttribute("aria-pressed", "true");
    expect(within(view).getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "false");
    expect(within(view).queryByRole("button", { name: "Próximas" })).not.toBeInTheDocument();
    expect(within(view).queryByRole("button", { name: "Histórico" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Suas reservas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Aulas do dia" })).not.toBeInTheDocument();
    expect(screen.getByText("Reservas")).toBeInTheDocument();
  });

  it("aba=suas na URL também abre em Suas aulas", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")]);
    renderPage(undefined, "/agenda?aba=suas");

    expect(await screen.findByRole("region", { name: "Suas reservas" })).toBeInTheDocument();
    expect(viewButton("Suas aulas")).toHaveAttribute("aria-pressed", "true");
  });

  it("aba=todas na URL abre em Todas, com a lista e a grade atuais", async () => {
    renderPage(undefined, "/agenda?aba=todas");

    const view = await screen.findByRole("group", { name: "Visão" });
    expect(within(view).getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("region", { name: "Aulas do dia" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Grade da semana" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Suas reservas" })).not.toBeInTheDocument();
    expect(screen.getByText(/^Semana de /)).toBeInTheDocument();
  });

  it("trocar de aba atualiza a URL; Suas aulas volta para /agenda sem aba", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")]);
    renderPage(undefined, "/agenda");
    const user = userEvent.setup();

    await screen.findByRole("region", { name: "Suas reservas" });
    await user.click(viewButton("Todas"));

    expect(await screen.findByRole("region", { name: "Aulas do dia" })).toBeInTheDocument();
    expect(screen.getByLabelText("query da rota")).toHaveTextContent("?aba=todas");

    await user.click(viewButton("Suas aulas"));

    expect(await screen.findByRole("region", { name: "Suas reservas" })).toBeInTheDocument();
    expect(screen.getByLabelText("query da rota")).toBeEmptyDOMElement();
  });

  it("lista só as reservas confirmadas e futuras", async () => {
    const requests: URLSearchParams[] = [];
    useReservations([reservation("res-1", TODAY, "18:00")], requests);
    renderPage(undefined, "/agenda");

    await screen.findByRole("region", { name: "Suas reservas" });
    // A lista pede só as confirmadas e futuras; a contagem do link do Histórico pede as anteriores (sem filtro).
    const listRequests = requests.filter((params) => params.get("when") === "upcoming");
    expect(listRequests).toHaveLength(1);
    expect(listRequests[0].get("status")).toBe("CONFIRMED");
  });

  it("agrupa por dia: Hoje, Amanhã e a data, com as aulas de cada dia em ordem de horário", async () => {
    // Fora de ordem e em dois dias distantes: o agrupamento é por dia da academia, não pela ordem da resposta.
    useReservations([
      reservation("res-3", addDays(TODAY, 4), "06:00", { name: "Musculação guiada", instructor: "Ana Souza" }),
      reservation("res-2", addDays(TODAY, 1), "07:00", { name: "Mobilidade" }),
      reservation("res-1b", TODAY, "20:00", { name: "Yoga" }),
      reservation("res-1", TODAY, "18:00"),
    ]);
    renderPage(undefined, "/agenda");

    const section = await screen.findByRole("region", { name: "Suas reservas" });
    const headings = await within(section).findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^Hoje · /),
      expect.stringMatching(/^Amanhã · /),
      expect.stringMatching(/^[A-Z][a-zç]{2}, \d{1,2}(\/\d{2})?$/),
    ]);

    const [today, tomorrow, later] = within(section).getAllByRole("list");
    expect(within(today).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("18h00"),
      expect.stringContaining("20h00"),
    ]);
    expect(within(today).getByText("Treino Funcional")).toBeInTheDocument();
    expect(within(today).getAllByText("Prof. Rafael")).toHaveLength(2);
    expect(within(tomorrow).getByText("Mobilidade")).toBeInTheDocument();
    expect(within(later).getByText("Musculação guiada")).toBeInTheDocument();
    expect(within(later).getByText("Prof. Ana")).toBeInTheDocument();
  });

  it("cada reserva tem Remarcar e Cancelar", async () => {
    useReservations([reservation("res-1", TODAY, "18:00"), reservation("res-2", addDays(TODAY, 1), "07:00")]);
    renderPage(undefined, "/agenda");

    const section = await screen.findByRole("region", { name: "Suas reservas" });
    expect(await within(section).findAllByRole("button", { name: /^Remarcar / })).toHaveLength(2);
    expect(within(section).getAllByRole("button", { name: /^Cancelar / })).toHaveLength(2);
  });

  it("Remarcar leva para Todas já em remarcação, sem tela nova", async () => {
    const original = item(TODAY, "18:00", { id: "occ-res-1", myReservationId: "res-1" });
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([original])),
      http.get("/api/agenda/:id", () => HttpResponse.json(original)),
    );
    useReservations([reservation("res-1", TODAY, "18:00")]);
    renderPage(undefined, "/agenda");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Remarcar Treino Funcional/ }));

    expect(await screen.findByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    expect(viewButton("Todas")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("query da rota")).toHaveTextContent("?aba=todas");
  });

  it("Cancelar abre a confirmação do cancelamento e, confirmado, a reserva sai da lista", async () => {
    const original = item(TODAY, "18:00", { id: "occ-res-1", myReservationId: "res-1" });
    let cancelled = false;
    server.use(
      http.get("/api/agenda/:id", () => HttpResponse.json(original)),
      http.get("/api/reservations", () =>
        HttpResponse.json(cancelled ? [] : [reservation("res-1", TODAY, "18:00")]),
      ),
      http.post("/api/reservations/:id/cancel", ({ params }) => {
        expect(params.id).toBe("res-1");
        cancelled = true;
        return HttpResponse.json({ ...reservation("res-1", TODAY, "18:00"), status: "CANCELLED" });
      }),
    );
    renderPage(undefined, "/agenda");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Cancelar Treino Funcional/ }));

    const sheet = await screen.findByRole("dialog", { name: "Treino Funcional" });
    expect(within(sheet).getByText(/Cancelar sua reserva em Treino Funcional/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Confirmar cancelamento" }));
    expect(await within(sheet).findByRole("status")).toHaveTextContent("Reserva cancelada.");
    await user.click(within(sheet).getByRole("button", { name: "Fechar" }));

    expect(await screen.findByText("Você não tem aulas reservadas daqui para frente.")).toBeInTheDocument();
  });

  it("sem reservas futuras mostra o vazio, e o botão leva para Todas", async () => {
    useReservations([]);
    renderPage(undefined, "/agenda");
    const user = userEvent.setup();

    expect(await screen.findByText("Você não tem aulas reservadas daqui para frente.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver todas as aulas" }));

    expect(await screen.findByRole("region", { name: "Aulas do dia" })).toBeInTheDocument();
    expect(viewButton("Todas")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("query da rota")).toHaveTextContent("?aba=todas");
  });

  it("falha ao carregar as reservas mostra o erro com nova tentativa", async () => {
    let calls = 0;
    server.use(
      http.get("/api/reservations", ({ request }) => {
        // A contagem do Histórico (when=past) não entra na conta: só a lista falha na primeira vez.
        if (new URL(request.url).searchParams.get("when") === "past") return HttpResponse.json([]);
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "X", message: "x" }, { status: 500 })
          : HttpResponse.json([reservation("res-1", TODAY, "18:00")]);
      }),
    );
    renderPage(undefined, "/agenda");
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar suas reservas.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Treino Funcional", { selector: "b" })).toBeInTheDocument();
  });

  it("vindo da Home em remarcação, abre em Todas mesmo sem aba na URL", async () => {
    renderPage(
      { rescheduling: { reservationId: "res-1", from: item(TODAY, "18:00", { myReservationId: "res-1" }) } },
      "/agenda",
    );

    expect(await screen.findByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    expect(viewButton("Todas")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByLabelText("query da rota")).toHaveTextContent("?aba=todas"));
  });
});

describe("ClientAgendaPage › Histórico dentro de Suas aulas", () => {
  const HISTORY_PATH = "/agenda?aba=suas&ver=historico";

  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
    server.use(http.get("/api/agenda", () => HttpResponse.json([item(TODAY, "07:00")])));
  });

  const past = (id: string, daysAgo: number, status: ReservationDetail["status"] = "COMPLETED") => ({
    ...reservation(id, addDays(TODAY, -daysAgo), "07:00"),
    status,
  });

  /** `upcoming` e `past` respondem pela query `when`; o `status` filtra as duas, como a API. */
  function useReservations(
    upcoming: ReservationDetail[],
    previous: ReservationDetail[],
    requests: URLSearchParams[] = [],
  ) {
    server.use(
      http.get("/api/reservations", ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        const list = params.get("when") === "past" ? previous : upcoming;
        const status = params.get("status");
        return HttpResponse.json(status ? list.filter((r) => r.status === status) : list);
      }),
    );
  }

  it("o fim de Suas aulas tem o link do Histórico com a contagem de aulas anteriores", async () => {
    useReservations(
      [reservation("res-1", TODAY, "18:00")],
      [past("p-1", 1), past("p-2", 2, "CANCELLED"), past("p-3", 3, "NO_SHOW")],
    );
    renderPage(undefined, "/agenda");

    const link = await screen.findByRole("link", { name: /^Histórico/ });
    await waitFor(() => expect(link).toHaveTextContent("3 aulas anteriores"));
    expect(link).toHaveAccessibleName("Histórico · 3 aulas anteriores");
    expect(link).toHaveAttribute("href", "/agenda?aba=suas&ver=historico");
  });

  it("com uma só aula anterior, o texto fica no singular", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")], [past("p-1", 1)]);
    renderPage(undefined, "/agenda");

    expect(await screen.findByRole("link", { name: "Histórico · 1 aula anterior" })).toBeInTheDocument();
  });

  it("o link do Histórico também aparece no estado vazio, abaixo de Ver todas as aulas", async () => {
    useReservations([], [past("p-1", 1), past("p-2", 2)]);
    renderPage(undefined, "/agenda");

    expect(await screen.findByText("Você não tem aulas reservadas daqui para frente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver todas as aulas" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Histórico · 2 aulas anteriores" })).toBeInTheDocument();
  });

  it("sem aulas anteriores o link diz 0 aulas anteriores", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")], []);
    renderPage(undefined, "/agenda");

    expect(await screen.findByRole("link", { name: "Histórico · 0 aulas anteriores" })).toBeInTheDocument();
  });

  it("se a consulta das anteriores falha, o link mostra só Histórico e a lista segue inteira", async () => {
    server.use(
      http.get("/api/reservations", ({ request }) =>
        new URL(request.url).searchParams.get("when") === "past"
          ? HttpResponse.json({ code: "X", message: "x" }, { status: 500 })
          : HttpResponse.json([reservation("res-1", TODAY, "18:00")]),
      ),
    );
    renderPage(undefined, "/agenda");

    expect(await screen.findByRole("button", { name: /^Remarcar Treino Funcional/ })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Histórico" });
    await waitFor(() => expect(link).toHaveAccessibleName("Histórico"));
    expect(link).not.toHaveTextContent("aulas anteriores");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("enquanto as anteriores carregam, o link mostra só Histórico", async () => {
    server.use(
      http.get("/api/reservations", async ({ request }) => {
        if (new URL(request.url).searchParams.get("when") === "past") {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return HttpResponse.json([past("p-1", 1)]);
        }
        return HttpResponse.json([reservation("res-1", TODAY, "18:00")]);
      }),
    );
    renderPage(undefined, "/agenda");

    const link = await screen.findByRole("link", { name: "Histórico" });
    expect(link).toHaveAccessibleName("Histórico");
    expect(await screen.findByRole("link", { name: "Histórico · 1 aula anterior" })).toBeInTheDocument();
  });

  it("o link abre o histórico dentro de Suas aulas, com a URL e o foco no título", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")], [past("p-1", 1)]);
    renderPage(undefined, "/agenda");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: /^Histórico/ }));

    const heading = await screen.findByRole("heading", { name: "Histórico" });
    expect(screen.getByLabelText("query da rota")).toHaveTextContent("?aba=suas&ver=historico");
    expect(viewButton("Suas aulas")).toHaveAttribute("aria-pressed", "true");
    expect(viewButton("Todas")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "Filtrar por estado" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Suas reservas" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Anteriores" })).toBeInTheDocument();
    expect(heading).toHaveFocus();
  });

  it("ver=historico na URL abre o histórico direto", async () => {
    useReservations([], [past("p-1", 1)]);
    renderPage(undefined, HISTORY_PATH);

    expect(await screen.findByRole("heading", { name: "Histórico" })).toBeInTheDocument();
    expect(viewButton("Suas aulas")).toHaveAttribute("aria-pressed", "true");
    const anteriores = await screen.findByRole("region", { name: "Anteriores" });
    expect(await within(anteriores).findByText("CONCLUÍDA")).toBeInTheDocument();
  });

  it("← Suas aulas volta para a lista, sem ver na URL, e devolve o foco ao link do Histórico", async () => {
    useReservations([reservation("res-1", TODAY, "18:00")], [past("p-1", 1)]);
    renderPage(undefined, HISTORY_PATH);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: "Suas aulas" }));

    expect(await screen.findByRole("region", { name: "Suas reservas" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Histórico" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("query da rota")).toBeEmptyDOMElement();
    expect(viewButton("Suas aulas")).toHaveAttribute("aria-pressed", "true");
    const link = await screen.findByRole("link", { name: /^Histórico/ });
    expect(link).toHaveFocus();
  });

  it("o filtro por estado continua: Canceladas pede só as canceladas", async () => {
    const requests: URLSearchParams[] = [];
    useReservations([], [past("p-1", 1), past("p-2", 2, "CANCELLED")], requests);
    renderPage(undefined, HISTORY_PATH);
    const user = userEvent.setup();

    const anteriores = await screen.findByRole("region", { name: "Anteriores" });
    expect(await within(anteriores).findAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Canceladas" }));

    await waitFor(() => expect(within(anteriores).getAllByRole("listitem")).toHaveLength(1));
    expect(within(anteriores).getByText("CANCELADA")).toBeInTheDocument();
    expect(
      requests.some((params) => params.get("when") === "past" && params.get("status") === "CANCELLED"),
    ).toBe(true);
  });

  it("Remarcar a partir do histórico leva para Todas, com o aviso no topo e sem ver na URL", async () => {
    const original = item(addDays(TODAY, 1), "18:00", { id: "occ-res-1", myReservationId: "res-1" });
    server.use(http.get("/api/agenda/:id", () => HttpResponse.json(original)));
    useReservations([reservation("res-1", addDays(TODAY, 1), "18:00")], []);
    renderPage(undefined, HISTORY_PATH);
    const user = userEvent.setup();

    const proximas = await screen.findByRole("region", { name: "Próximas reservas" });
    await user.click(await within(proximas).findByRole("button", { name: /Treino Funcional/ }));
    const sheet = await screen.findByRole("dialog", { name: "Treino Funcional" });
    await user.click(within(sheet).getByRole("button", { name: "Remarcar" }));

    expect(await screen.findByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    expect(viewButton("Todas")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("query da rota")).toHaveTextContent(/^\?aba=todas$/);
    expect(screen.queryByRole("heading", { name: "Histórico" })).not.toBeInTheDocument();
  });

  it("remarcação vinda da Home com ver=historico na URL abre em Todas, sem prender o histórico", async () => {
    useReservations([], []);
    renderPage(
      { rescheduling: { reservationId: "res-1", from: item(TODAY, "18:00", { myReservationId: "res-1" }) } },
      HISTORY_PATH,
    );

    expect(await screen.findByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    expect(viewButton("Todas")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Histórico" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("query da rota")).toHaveTextContent(/^\?aba=todas$/));
  });

  it("ver=historico fora de Suas aulas é ignorado: aba=todas continua na grade", async () => {
    useReservations([], []);
    renderPage(undefined, "/agenda?aba=todas&ver=historico");

    expect(await screen.findByRole("region", { name: "Aulas do dia" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Histórico" })).not.toBeInTheDocument();
  });
});

describe("ClientAgendaPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  it("chega da Home já em remarcação quando a navegação leva a reserva", async () => {
    server.use(http.get("/api/agenda", () => HttpResponse.json([])));

    renderPage({
      rescheduling: {
        reservationId: "res-1",
        from: item(TODAY, "18:00", { myReservationId: "res-1" }),
      },
    });

    expect(await screen.findByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
  });

  it("limpa o state da rota ao consumir a remarcação, para não voltar em back/reload", async () => {
    server.use(http.get("/api/agenda", () => HttpResponse.json([])));

    renderPage({
      rescheduling: {
        reservationId: "res-1",
        from: item(TODAY, "18:00", { myReservationId: "res-1" }),
      },
    });

    expect(await screen.findByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("state da rota")).toHaveTextContent("null"));
  });

  /** O grupo (`details`) do horário, pelo texto do cabeçalho ("18h"). */
  function groupAt(day: HTMLElement, hour: string) {
    const summary = within(day)
      .getAllByText(hour, { selector: ".fb-hgroup__time" })
      .map((el) => el.closest("summary")!)[0];
    return { summary, details: summary.closest("details")! };
  }

  /** Abre o grupo do horário (se ainda fechado) e devolve o `details`. */
  async function openGroup(user: ReturnType<typeof userEvent.setup>, day: HTMLElement, hour: string) {
    await within(day).findAllByText(hour, { selector: ".fb-hgroup__time" });
    const { summary, details } = groupAt(day, hour);
    if (!details.open) await user.click(summary);
    return details;
  }

  const mod = (id: string, name: string) => ({ name, modality: { id, name } });

  it("agrupa o dia selecionado (hoje por padrão) por horário, em ordem, e mostra só o dia escolhido", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", mod("m2", "Spinning")),
          item(TODAY, "18:00"),
          item(OTHER_DAY, "10:00", mod("m3", "Yoga")),
        ]),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("Spinning · Prof. Rafael");
    const groups = [...day.querySelectorAll("details")];
    expect(groups.map((group) => group.querySelector(".fb-hgroup__time")?.textContent)).toEqual([
      "07hmanhã",
      "18hnoite",
    ]);
    expect(within(day).queryByText("Yoga")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: formatDayLabel(OTHER_DAY, weekdayOf(OTHER_DAY)) }),
    );
    expect(await within(day).findByText("Yoga · Prof. Rafael")).toBeInTheDocument();
  });

  it("grupo fechado: nº de aulas, modalidades, vagas somadas e selos", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          // 06h: 2 aulas, 2 vagas de 16 (Poucas vagas)
          item(TODAY, "06:00", { ...mod("m1", "Funcional"), id: "a", capacity: 8, available: 0 }),
          item(TODAY, "06:00", { ...mod("m2", "Musculação"), id: "b", capacity: 8, available: 2 }),
          // 07h: 1 aula, 1 vaga de 8
          item(TODAY, "07:00", { ...mod("m3", "Mobilidade"), id: "c", capacity: 8, available: 1 }),
          // 12h: lotado
          item(TODAY, "12:00", { ...mod("m1", "Funcional"), id: "d", capacity: 16, available: 0 }),
          // 19h: aberto, sem selo
          item(TODAY, "19:00", { ...mod("m1", "Funcional"), id: "e", capacity: 16, available: 11 }),
        ]),
      ),
    );

    renderPage();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("2 aulas");

    const g06 = groupAt(day, "06h").details;
    expect(g06).toHaveTextContent("2 aulas");
    expect(g06).toHaveTextContent("Funcional, Musculação");
    expect(g06).toHaveTextContent("2 vagas de 16");
    expect(within(g06).getByText("Poucas vagas")).toBeInTheDocument();

    const g07 = groupAt(day, "07h").details;
    expect(g07).toHaveTextContent("1 aula");
    expect(g07).toHaveTextContent("Mobilidade · Prof. Rafael");
    expect(g07).toHaveTextContent("1 vaga de 8");

    const g12 = groupAt(day, "12h").details;
    expect(g12).toHaveTextContent("0 vagas de 16");
    expect(within(g12).getByText("Lotado")).toBeInTheDocument();
    expect(g12.querySelector(".fb-hgroup__bar")).toHaveAttribute("aria-hidden", "true");

    const g19 = groupAt(day, "19h").details;
    expect(g19).toHaveTextContent("11 vagas de 16");
    expect(g19.querySelector("summary .fb-ui-badge")).toBeNull();
    for (const group of [g06, g07, g12, g19]) expect(group).not.toHaveAttribute("open");
    expect(
      screen.getByText("Disponibilidade sujeita a confirmação no momento da reserva."),
    ).toBeInTheDocument();
  });

  it("\"Você reservou\" vence \"Poucas vagas\" e \"Lotado\"", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "08:00", { id: "a", capacity: 8, available: 2, myReservationId: "res-1" }),
          item(TODAY, "09:00", { id: "b", capacity: 8, available: 0, myReservationId: "res-2" }),
        ]),
      ),
    );

    renderPage();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findAllByText("Você reservou");

    for (const hour of ["08h", "09h"]) {
      const group = groupAt(day, hour).details;
      expect(within(group).getByText("Você reservou")).toBeInTheDocument();
      expect(within(group).queryByText("Poucas vagas")).not.toBeInTheDocument();
      expect(within(group).queryByText("Lotado")).not.toBeInTheDocument();
    }
  });

  it("o grupo com reserva do cliente já vem aberto; os demais, fechados; o aberto pelo usuário não é sobrescrito", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { id: "a", myReservationId: "res-1" }),
          item(TODAY, "18:00", { id: "b" }),
        ]),
      ),
    );

    renderPage();
    const user = userEvent.setup();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("Você reservou");

    const mine = groupAt(day, "07h").details;
    const other = groupAt(day, "18h").details;
    expect(mine).toHaveAttribute("open");
    expect(other).not.toHaveAttribute("open");

    await user.click(groupAt(day, "18h").summary);
    expect(other).toHaveAttribute("open");
    // Fechar o grupo da reserva e navegar de volta ao dia mantém a escolha do usuário durante re-renders.
    await user.click(groupAt(day, "07h").summary);
    expect(mine).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(mine).not.toHaveAttribute("open");
  });

  it("abrir um grupo mostra as aulas (modalidade, professor, duração, vagas ou Reservada) como controles com nome acessível", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "18:00", { id: "a", capacity: 12, available: 9 }),
          item(TODAY, "18:00", { ...mod("m2", "Yoga"), id: "b", myReservationId: "res-1" }),
        ]),
      ),
    );

    renderPage();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("2 aulas");

    const functional = within(day).getByRole("button", { name: /Treino Funcional.*18h00/ });
    expect(functional).toHaveTextContent("Prof. Rafael");
    expect(functional).not.toHaveTextContent("Andrade");
    expect(functional).toHaveTextContent("60 min");
    expect(functional).toHaveTextContent("9/12 vagas");
    const yoga = within(day).getByRole("button", { name: /Yoga.*18h00/ });
    expect(yoga).toHaveTextContent("Reservada");
    expect(yoga).not.toHaveTextContent("vagas");
  });

  it("o filtro de modalidade age antes do agrupamento: vagas recalculadas e grupo sem aula some", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "06:00", { ...mod("m1", "Funcional"), id: "a", capacity: 8, available: 5 }),
          item(TODAY, "06:00", { ...mod("m2", "Yoga"), id: "b", capacity: 8, available: 2 }),
          item(TODAY, "09:00", { ...mod("m2", "Yoga"), id: "c", capacity: 8, available: 6 }),
        ]),
      ),
    );

    renderPage();
    const user = userEvent.setup();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("2 aulas");
    expect(groupAt(day, "06h").details).toHaveTextContent("7 vagas de 16");

    await user.click(within(screen.getByRole("group", { name: "Modalidade" })).getByRole("button", { name: "Yoga" }));
    expect(groupAt(day, "06h").details).toHaveTextContent("1 aula");
    expect(groupAt(day, "06h").details).toHaveTextContent("2 vagas de 8");
    expect(groupAt(day, "06h").details).toHaveTextContent("Poucas vagas");

    await user.click(within(screen.getByRole("group", { name: "Modalidade" })).getByRole("button", { name: "Funcional" }));
    expect(groupAt(day, "06h").details).toHaveTextContent("5 vagas de 8");
    expect(within(day).queryByText("09h")).not.toBeInTheDocument();
  });

  it("só daqui para frente: aula de hoje já iniciada não aparece, e o grupo some junto", async () => {
    vi.setSystemTime(gymDateTimeToUtc(TODAY, "10:30"));
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { id: "past" }),
          item(TODAY, "10:00", { id: "started" }),
          item(TODAY, "18:00", { id: "later" }),
        ]),
      ),
    );

    renderPage();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("1 aula");
    expect(day.querySelectorAll("details")).toHaveLength(1);
    expect(within(day).queryByText("07h")).not.toBeInTheDocument();
    expect(within(day).queryByText("10h")).not.toBeInTheDocument();
    expect(within(day).getByText("18h")).toBeInTheDocument();
    const grid = screen.getByRole("region", { name: "Grade da semana" });
    expect(within(grid).getAllByRole("button", { name: /1 aula/ })).toHaveLength(1);
  });

  it("hoje sem aulas futuras mostra o vazio do dia", async () => {
    vi.setSystemTime(gymDateTimeToUtc(TODAY, "20:00"));
    server.use(http.get("/api/agenda", () => HttpResponse.json([item(TODAY, "18:00")])));

    renderPage();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    expect(await within(day).findByText("Nenhuma aula agendada para este dia.")).toBeInTheDocument();
  });

  it("na semana atual a seta Semana anterior fica desativada e os chips começam em hoje; na seguinte, volta", async () => {
    server.use(http.get("/api/agenda", () => HttpResponse.json([])));

    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Aulas do dia" });

    const previous = screen.getAllByRole("button", { name: "Semana anterior" })[0];
    expect(previous).toBeDisabled();
    const days = screen.getByRole("group", { name: "Dia" });
    expect(within(days).getAllByRole("button")).toHaveLength(5);
    expect(
      within(days).queryByRole("button", { name: formatDayLabel(WEEK_START, weekdayOf(WEEK_START)) }),
    ).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Próxima semana" })[0]);
    expect(screen.getAllByRole("button", { name: "Semana anterior" })[0]).toBeEnabled();
    expect(within(screen.getByRole("group", { name: "Dia" })).getAllByRole("button")).toHaveLength(7);
  });

  it("indica quase lotada e lotada por aula e avisa que depende de confirmação", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { id: "a", available: 9, capacity: 12 }),
          item(TODAY, "07:00", { ...mod("m2", "Yoga"), id: "b", available: 3, capacity: 12 }),
          item(TODAY, "07:00", { ...mod("m3", "Spinning"), id: "c", available: 0, capacity: 10 }),
        ]),
      ),
    );

    renderPage();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    // O nível vai no texto do selo (não só na cor).
    expect(await within(day).findByText("9/12 vagas")).toBeInTheDocument();
    expect(within(day).getByText("3/12 vagas · quase lotada")).toBeInTheDocument();
    expect(within(day).getByText("0/10 vagas · lotada")).toBeInTheDocument();
  });

  it("marca na grade as aulas que já reservei", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { myReservationId: "res-1" }),
          item(TODAY, "18:00"),
        ]),
      ),
    );

    renderPage();
    await screen.findByRole("region", { name: "Aulas do dia" });
    const grid = screen.getByRole("region", { name: "Grade da semana" });
    expect(await within(grid).findAllByText("Você reservou")).toHaveLength(1);
  });

  it("mostra estado vazio quando não há aulas no dia", async () => {
    server.use(http.get("/api/agenda", () => HttpResponse.json([])));

    renderPage();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    expect(
      await within(day).findByText("Nenhuma aula agendada para este dia."),
    ).toBeInTheDocument();
  });

  it("navega para a semana seguinte", async () => {
    const requested: string[] = [];
    server.use(
      http.get("/api/agenda", ({ request }) => {
        requested.push(new URL(request.url).searchParams.get("from")!);
        return HttpResponse.json([]);
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await screen.findByRole("region", { name: "Aulas do dia" });
    await user.click(screen.getAllByRole("button", { name: "Próxima semana" })[0]);

    await waitFor(() => expect(requested).toContain(addDays(WEEK_START, 7)));
    expect(requested[0]).toBe(WEEK_START);
  });

  async function openDetail(time: string) {
    const user = userEvent.setup();
    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await openGroup(user, day, `${time.slice(0, 2)}h`);
    await user.click(await within(day).findByRole("button", { name: new RegExp(time) }));
    return { user, sheet: screen.getByRole("dialog", { name: "Treino Funcional" }) };
  }

  it("abre o detalhe da aula com a descrição e a disponibilidade", async () => {
    const occurrence = item(TODAY, "18:00", { available: 3 });
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
    );

    renderPage();
    const { sheet } = await openDetail("18h00");

    expect(sheet).toHaveTextContent("Circuito com estímulos de força e resistência.");
    expect(within(sheet).getByText("Duração")).toBeInTheDocument();
    expect(sheet).toHaveTextContent("60 minutos");
    expect(within(sheet).getByText("3 de 12 vagas")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Reservar aula" })).toBeEnabled();
  });

  it("reserva a aula e confirma na hora, atualizando a agenda", async () => {
    const occurrence = item(TODAY, "18:00", { available: 3 });
    let agendaRequests = 0;
    let reserved = false;
    const current = () =>
      reserved ? { ...occurrence, available: 2, myReservationId: "res-1" } : occurrence;
    server.use(
      http.get("/api/agenda", () => {
        agendaRequests += 1;
        return HttpResponse.json([current()]);
      }),
      http.get("/api/agenda/:id", () => HttpResponse.json(current())),
      http.post("/api/reservations", async ({ request }) => {
        expect(await request.json()).toEqual({ occurrenceId: occurrence.id });
        reserved = true;
        return HttpResponse.json(reservationOf(occurrence), { status: 201 });
      }),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");
    await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));

    expect(
      await within(sheet).findByText("Reserva confirmada com sucesso. Bom treino!"),
    ).toBeInTheDocument();
    await waitFor(() => expect(agendaRequests).toBeGreaterThan(1));
    expect(await within(sheet).findByText("2 de 12 vagas")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Ver na agenda" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aula lotada na confirmação: mostra o motivo e a disponibilidade atualizada", async () => {
    const occurrence = item(TODAY, "18:00", { available: 1 });
    let full = false;
    const current = () => (full ? { ...occurrence, available: 0 } : occurrence);
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([current()])),
      http.get("/api/agenda/:id", () => HttpResponse.json(current())),
      http.post("/api/reservations", () => {
        full = true;
        return HttpResponse.json(
          {
            code: "CLASS_FULL",
            message: "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.",
            details: { currentAvailableSpots: 0 },
          },
          { status: 409 },
        );
      }),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");
    await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.",
    );
    expect(await within(sheet).findByText("0 de 12 vagas")).toBeInTheDocument();
    const day = screen.getByRole("region", { name: "Aulas do dia" });
    expect(await within(day).findByText("0/12 vagas · lotada")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Reservar aula" })).not.toBeInTheDocument();
  });

  it("mostra a mensagem específica de cada recusa", async () => {
    const occurrence = item(TODAY, "18:00");
    let refusal = {
      code: "DUPLICATE_RESERVATION",
      message: "Você já reservou esta aula. Não é possível reservar duas vezes.",
    };
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
      http.post("/api/reservations", () => HttpResponse.json(refusal, { status: 409 })),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");
    await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Você já reservou esta aula. Não é possível reservar duas vezes.",
    );
    expect(within(sheet).getByRole("button", { name: "Ver minha reserva" })).toBeInTheDocument();

    await user.click(within(sheet).getAllByRole("button", { name: "Fechar" })[0]);
    refusal = {
      code: "OCCURRENCE_NOT_BOOKABLE",
      message: "Esta aula não pode mais ser reservada: foi cancelada ou já começou.",
    };
    const reopened = await openDetail("18h00");
    await user.click(within(reopened.sheet).getByRole("button", { name: "Reservar aula" }));
    expect(await within(reopened.sheet).findByRole("alert")).toHaveTextContent(
      "Esta aula não pode mais ser reservada: foi cancelada ou já começou.",
    );
    expect(
      within(reopened.sheet).getByRole("button", { name: "Ver outros horários" }),
    ).toBeInTheDocument();
  });

  it("conflito de horário: indica qual é a outra aula reservada", async () => {
    const occurrence = item(TODAY, "18:00");
    const other = item(TODAY, "18:00", {
      id: "occ-spinning",
      name: "Spinning",
      modality: { id: "m2", name: "Spinning" },
    });
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
      http.post("/api/reservations", () =>
        HttpResponse.json(
          {
            code: "SCHEDULE_CONFLICT",
            message: "Você já tem uma reserva em Spinning às 18h00, no mesmo horário desta aula.",
            details: { reservation: { ...reservationOf(other), id: "res-spinning" } },
          },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");
    await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Você já tem uma reserva em Spinning às 18h00, no mesmo horário desta aula.",
    );
    await user.click(within(sheet).getByRole("button", { name: "Ver minha agenda" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nova tentativa após falha de rede reenvia a mesma Idempotency-Key", async () => {
    const occurrence = item(TODAY, "18:00");
    const keys: (string | null)[] = [];
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
      http.post("/api/reservations", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        if (keys.length === 1) return HttpResponse.error();
        return HttpResponse.json(reservationOf(occurrence), { status: 201 });
      }),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");
    await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir a reserva. Tente novamente.",
    );
    await user.click(within(sheet).getByRole("button", { name: "Tentar novamente" }));

    expect(
      await within(sheet).findByText("Reserva confirmada com sucesso. Bom treino!"),
    ).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("aula já reservada mostra RESERVA CONFIRMADA em vez de Reservar", async () => {
    const occurrence = item(TODAY, "18:00", { myReservationId: "res-1" });
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
    );

    renderPage();
    const { sheet } = await openDetail("18h00");

    expect(within(sheet).getByText("RESERVA CONFIRMADA")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Cancelar reserva" })).toBeEnabled();
    expect(within(sheet).queryByRole("button", { name: "Reservar aula" })).not.toBeInTheDocument();
  });

  it("cancela a reserva depois de confirmar, liberando a vaga", async () => {
    const occurrence = item(TODAY, "18:00", { available: 2, myReservationId: "res-1" });
    let cancelled = false;
    const current = () =>
      cancelled ? { ...occurrence, available: 3, myReservationId: null } : occurrence;
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([current()])),
      http.get("/api/agenda/:id", () => HttpResponse.json(current())),
      http.post("/api/reservations/:id/cancel", ({ params }) => {
        expect(params.id).toBe("res-1");
        cancelled = true;
        return HttpResponse.json({
          ...reservationOf(occurrence),
          status: "CANCELLED",
          cancelledAt: new Date().toISOString(),
        });
      }),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");

    await user.click(within(sheet).getByRole("button", { name: "Cancelar reserva" }));
    expect(
      within(sheet).getByText(/A vaga será liberada para outros clientes/),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Voltar" }));
    expect(within(sheet).getByText("RESERVA CONFIRMADA")).toBeInTheDocument();
    expect(cancelled).toBe(false);

    await user.click(within(sheet).getByRole("button", { name: "Cancelar reserva" }));
    await user.click(within(sheet).getByRole("button", { name: "Confirmar cancelamento" }));

    expect(await within(sheet).findByRole("status")).toHaveTextContent(
      "Reserva cancelada. A vaga foi liberada para outros clientes.",
    );
    expect(await within(sheet).findByText("3 de 12 vagas")).toBeInTheDocument();
  });

  it("cancelamento depois do início da aula mostra o motivo", async () => {
    const occurrence = item(TODAY, "18:00", { myReservationId: "res-1" });
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
      http.post("/api/reservations/:id/cancel", () =>
        HttpResponse.json(
          {
            code: "CANCELLATION_WINDOW_CLOSED",
            message: "Não é mais possível cancelar: a aula já começou.",
          },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    const { user, sheet } = await openDetail("18h00");
    await user.click(within(sheet).getByRole("button", { name: "Cancelar reserva" }));
    await user.click(within(sheet).getByRole("button", { name: "Confirmar cancelamento" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Não é mais possível cancelar: a aula já começou.",
    );
    await user.click(within(sheet).getByRole("button", { name: "Voltar" }));
    expect(within(sheet).getByText("RESERVA CONFIRMADA")).toBeInTheDocument();
  });

  describe("remarcar", () => {
    const original = item(TODAY, "07:00", { id: "occ-original", myReservationId: "res-1" });
    const target = item(TODAY, "18:00", {
      id: "occ-target",
      name: "Yoga",
      modality: { id: "m3", name: "Yoga" },
      available: 4,
    });

    function useAgenda() {
      server.use(
        http.get("/api/agenda", () => HttpResponse.json([original, target])),
        http.get("/api/agenda/:id", ({ params }) =>
          HttpResponse.json(params.id === original.id ? original : target),
        ),
      );
    }

    async function startRescheduling() {
      const user = userEvent.setup();
      const day = await screen.findByRole("region", { name: "Aulas do dia" });
      await openGroup(user, day, "07h");
      await user.click(await within(day).findByRole("button", { name: /07h00/ }));
      const sheet = screen.getByRole("dialog", { name: "Treino Funcional" });
      await user.click(within(sheet).getByRole("button", { name: "Remarcar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await openGroup(user, day, "18h");
      await user.click(within(day).getByRole("button", { name: /18h00/ }));
      return { user, sheet: screen.getByRole("dialog", { name: "Yoga" }) };
    }

    it("escolhe a nova aula na agenda e remarca numa única ação", async () => {
      useAgenda();
      let requestBody: unknown;
      let key: string | null = null;
      server.use(
        http.post("/api/reservations/:id/reschedule", async ({ params, request }) => {
          expect(params.id).toBe("res-1");
          requestBody = await request.json();
          key = request.headers.get("Idempotency-Key");
          return HttpResponse.json({ ...reservationOf(target), id: "res-2" }, { status: 201 });
        }),
      );

      renderPage();
      const { user, sheet } = await startRescheduling();
      expect(screen.getByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
      await user.click(within(sheet).getByRole("button", { name: "Remarcar para esta aula" }));

      expect(await within(sheet).findByRole("status")).toHaveTextContent(
        "Reserva remarcada. Bom treino!",
      );
      expect(requestBody).toEqual({ occurrenceId: target.id });
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
      expect(screen.queryByText(/Remarcando Treino Funcional/)).not.toBeInTheDocument();
    });

    it("remarcação recusada mostra o motivo e que a reserva original continua ativa", async () => {
      useAgenda();
      server.use(
        http.post("/api/reservations/:id/reschedule", () =>
          HttpResponse.json(
            {
              code: "CLASS_FULL",
              message: "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.",
              details: { currentAvailableSpots: 0 },
            },
            { status: 409 },
          ),
        ),
      );

      renderPage();
      const { user, sheet } = await startRescheduling();
      await user.click(within(sheet).getByRole("button", { name: "Remarcar para esta aula" }));

      const alert = await within(sheet).findByRole("alert");
      expect(alert).toHaveTextContent("Não foi possível remarcar");
      expect(alert).toHaveTextContent("Essa aula ficou lotada enquanto você confirmava.");
      expect(alert).toHaveTextContent(
        "Sua reserva original em Treino Funcional, hoje às 07h00 continua confirmada.",
      );
      expect(within(sheet).getByText("RESERVA ORIGINAL ATIVA")).toBeInTheDocument();

      await user.click(within(sheet).getByRole("button", { name: "Tentar remarcar novamente" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    });

    it("falha do servidor na remarcação não afirma que a original continua e repete com a mesma chave", async () => {
      useAgenda();
      const keys: (string | null)[] = [];
      server.use(
        http.post("/api/reservations/:id/reschedule", ({ request }) => {
          keys.push(request.headers.get("Idempotency-Key"));
          if (keys.length === 1) {
            return HttpResponse.json(
              { code: "INTERNAL_ERROR", message: "Erro interno inesperado." },
              { status: 500 },
            );
          }
          return HttpResponse.json({ ...reservationOf(target), id: "res-2" }, { status: 201 });
        }),
      );

      renderPage();
      const { user, sheet } = await startRescheduling();
      await user.click(within(sheet).getByRole("button", { name: "Remarcar para esta aula" }));

      expect(await within(sheet).findByRole("alert")).toHaveTextContent("Erro interno inesperado.");
      expect(within(sheet).queryByText("RESERVA ORIGINAL ATIVA")).not.toBeInTheDocument();
      await user.click(within(sheet).getByRole("button", { name: "Tentar novamente" }));

      expect(await within(sheet).findByRole("status")).toHaveTextContent(
        "Reserva remarcada. Bom treino!",
      );
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
    });

    it("desistir sai do modo de remarcação", async () => {
      useAgenda();

      renderPage();
      const { user } = await startRescheduling();
      await user.click(screen.getAllByRole("button", { name: "Fechar" })[0]);
      await user.click(screen.getByRole("button", { name: "Desistir" }));

      expect(screen.queryByText(/Remarcando Treino Funcional/)).not.toBeInTheDocument();
    });
  });
});

function reservationOf(occurrence: ClientAgendaItem) {
  return {
    id: "res-1",
    status: "CONFIRMED",
    occurrence: {
      id: occurrence.id,
      name: occurrence.name,
      modality: occurrence.modality,
      instructor: occurrence.instructor,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      durationMinutes: occurrence.durationMinutes,
      status: "SCHEDULED",
    },
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
}

describe("ClientAgendaPage › grade da semana (desktop) agrupada por horário", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  const mod = (id: string, name: string) => ({ name, modality: { id, name } });
  const agenda = (items: ClientAgendaItem[]) =>
    server.use(http.get("/api/agenda", () => HttpResponse.json(items)));

  async function gridRegion() {
    await screen.findByRole("region", { name: "Aulas do dia" });
    return screen.getByRole("region", { name: "Grade da semana" });
  }

  const block = (grid: HTMLElement, name: RegExp | string) => within(grid).findByRole("button", { name });

  it("mostra um bloco por horário e dia com a contagem de aulas e a soma de vagas", async () => {
    agenda([
      item(TODAY, "18:00", { id: "a", available: 4, capacity: 8 }),
      item(TODAY, "18:00", { ...mod("m2", "Yoga"), id: "b", available: 3, capacity: 8 }),
      item(TODAY, "18:00", { ...mod("m3", "Spinning"), id: "c", available: 2, capacity: 8 }),
    ]);
    renderPage();
    const grid = await gridRegion();

    const cell = await block(grid, "18h, quarta 11: 3 aulas, 9 de 24 vagas");
    expect(cell).toHaveAttribute("aria-expanded", "false");
    expect(within(cell).getByText("3 aulas")).toBeInTheDocument();
    expect(within(cell).getByText("9 de 24 vagas")).toBeInTheDocument();
    expect(within(grid).queryByRole("button", { name: /Yoga/ })).not.toBeInTheDocument();
  });

  it("horário com uma só aula também vira bloco", async () => {
    agenda([item(OTHER_DAY, "07:00", { available: 5, capacity: 8 })]);
    renderPage();
    const grid = await gridRegion();

    const cell = await block(grid, "07h, quinta 12: 1 aula, 5 de 8 vagas");
    expect(within(cell).getByText("1 aula")).toBeInTheDocument();
  });

  it("mostra Lotado quando o total de vagas é zero", async () => {
    agenda([
      item(TODAY, "12:00", { id: "a", available: 0 }),
      item(TODAY, "12:00", { ...mod("m2", "Yoga"), id: "b", available: 0 }),
    ]);
    renderPage();
    const grid = await gridRegion();

    const cell = await block(grid, /^12h, quarta 11: 2 aulas, lotado/);
    expect(within(cell).getByText("Lotado")).toBeInTheDocument();
    expect(within(cell).queryByText(/de 24 vagas/)).not.toBeInTheDocument();
  });

  it("Poucas vagas no limite de 3 e não com 4", async () => {
    agenda([
      item(TODAY, "07:00", { id: "a", available: 3 }),
      item(OTHER_DAY, "07:00", { id: "b", available: 4 }),
    ]);
    renderPage();
    const grid = await gridRegion();

    const low = await block(grid, /^07h, quarta 11/);
    const ok = await block(grid, /^07h, quinta 12/);
    expect(within(low).getByText("Poucas vagas")).toBeInTheDocument();
    expect(within(ok).queryByText("Poucas vagas")).not.toBeInTheDocument();
  });

  it("célula com reserva já vem aberta, destacada e com o texto Você reservou", async () => {
    agenda([
      item(TODAY, "18:00", { id: "a", myReservationId: "res-1", available: 4 }),
      item(TODAY, "18:00", { ...mod("m2", "Yoga"), id: "b", available: 5 }),
    ]);
    renderPage();
    const grid = await gridRegion();

    const cell = await block(grid, /^18h, quarta 11: 2 aulas/);
    expect(cell).toHaveAttribute("aria-expanded", "true");
    expect(within(cell).getByText("Você reservou")).toBeInTheDocument();
    expect(cell.className).toContain("fb-wkblock--mine");
    expect(within(grid).getByRole("button", { name: /Treino Funcional/ })).toHaveTextContent("Reservada");
    expect(within(grid).getByRole("button", { name: /Yoga/ })).toHaveTextContent("5 vagas");
  });

  it("expande e recolhe pelo cabeçalho do bloco, e o estado do usuário vale nos re-renders", async () => {
    agenda([
      item(TODAY, "18:00", { id: "a" }),
      item(TODAY, "18:00", { ...mod("m2", "Yoga"), id: "b" }),
    ]);
    renderPage();
    const user = userEvent.setup();
    const grid = await gridRegion();

    const cell = await block(grid, /^18h, quarta 11/);
    expect(within(grid).queryByRole("button", { name: /Yoga/ })).not.toBeInTheDocument();

    await user.click(cell);
    expect(cell).toHaveAttribute("aria-expanded", "true");
    expect(within(grid).getByRole("button", { name: /Yoga/ })).toBeInTheDocument();

    await user.click(cell);
    expect(cell).toHaveAttribute("aria-expanded", "false");
    expect(within(grid).queryByRole("button", { name: /Yoga/ })).not.toBeInTheDocument();
  });

  it("clicar numa aula do bloco aberto abre o detalhe", async () => {
    const yoga = item(TODAY, "18:00", { ...mod("m2", "Yoga"), id: "b", available: 5 });
    agenda([item(TODAY, "18:00", { id: "a" }), yoga]);
    server.use(http.get("/api/agenda/:id", () => HttpResponse.json(yoga)));
    renderPage();
    const user = userEvent.setup();
    const grid = await gridRegion();

    await user.click(await block(grid, /^18h, quarta 11/));
    await user.click(within(grid).getByRole("button", { name: /Yoga/ }));

    expect(await screen.findByRole("dialog", { name: "Yoga" })).toBeInTheDocument();
  });

  it("o filtro de modalidade recalcula o total do bloco", async () => {
    agenda([
      item(TODAY, "18:00", { id: "a", available: 4, capacity: 8 }),
      item(TODAY, "18:00", { ...mod("m2", "Yoga"), id: "b", available: 5, capacity: 8 }),
    ]);
    renderPage();
    const user = userEvent.setup();
    const grid = await gridRegion();

    await block(grid, "18h, quarta 11: 2 aulas, 9 de 16 vagas");
    await user.click(screen.getByRole("button", { name: "Yoga" }));
    expect(await block(grid, "18h, quarta 11: 1 aula, 5 de 8 vagas")).toBeInTheDocument();
  });

  it("aula de hoje já iniciada fica fora da grade", async () => {
    vi.setSystemTime(gymDateTimeToUtc(TODAY, "10:30"));
    agenda([item(TODAY, "10:00", { id: "started" }), item(TODAY, "18:00", { id: "later" })]);
    renderPage();
    const grid = await gridRegion();

    await block(grid, /^18h, quarta 11: 1 aula/);
    expect(within(grid).queryByRole("button", { name: /^10h/ })).not.toBeInTheDocument();
    expect(within(grid).queryByText("10h00")).not.toBeInTheDocument();
  });

  it("remarcação continua a partir da grade", async () => {
    const original = item(TODAY, "07:00", { id: "occ-original", myReservationId: "res-1" });
    const target = item(TODAY, "18:00", { ...mod("m3", "Yoga"), id: "occ-target", available: 4 });
    agenda([original, target]);
    server.use(
      http.get("/api/agenda/:id", () => HttpResponse.json(target)),
      http.post("/api/reservations/:id/reschedule", () =>
        HttpResponse.json({ ...reservationOf(target), id: "res-2" }, { status: 201 }),
      ),
    );
    renderPage({ rescheduling: { reservationId: "res-1", from: original } });
    const user = userEvent.setup();
    const grid = await gridRegion();

    expect(screen.getByText(/Remarcando Treino Funcional/)).toBeInTheDocument();
    await user.click(await block(grid, /^18h, quarta 11/));
    await user.click(within(grid).getByRole("button", { name: /Yoga/ }));
    const sheet = await screen.findByRole("dialog", { name: "Yoga" });
    await user.click(within(sheet).getByRole("button", { name: "Remarcar para esta aula" }));

    expect(await within(sheet).findByRole("status")).toHaveTextContent("Reserva remarcada. Bom treino!");
  });
});
