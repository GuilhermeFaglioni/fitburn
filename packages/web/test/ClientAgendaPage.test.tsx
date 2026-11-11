import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
  gymToday,
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

const TODAY = gymToday();
const WEEK_START = startOfWeek(TODAY);
const OTHER_DAY = TODAY === WEEK_START ? addDays(WEEK_START, 1) : WEEK_START;

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

  it("agrupa por dia: mostra as aulas do dia selecionado (hoje por padrão) em ordem", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { name: "Spinning", modality: { id: "m2", name: "Spinning" } }),
          item(TODAY, "18:00"),
          item(OTHER_DAY, "10:00", { name: "Yoga", modality: { id: "m3", name: "Yoga" } }),
        ]),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("Spinning");
    const cards = within(day).getAllByRole("button", { name: /Prof\./ });
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("07h00"),
      expect.stringContaining("18h00"),
    ]);
    for (const card of cards) {
      expect(card).toHaveTextContent("60 min");
      expect(card).toHaveTextContent("Prof. Rafael");
      expect(card).not.toHaveTextContent("Andrade");
    }
    expect(within(day).queryByText("Yoga")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: formatDayLabel(OTHER_DAY, weekdayOf(OTHER_DAY)) }),
    );
    expect(await within(day).findByText("Yoga")).toBeInTheDocument();
  });

  it("indica vagas disponíveis, quase lotada e lotada, e avisa que depende de confirmação", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { available: 9, capacity: 12 }),
          item(TODAY, "12:00", { available: 3, capacity: 12 }),
          item(TODAY, "19:00", { available: 0, capacity: 10 }),
        ]),
      ),
    );

    renderPage();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    // O nível vai no texto do selo (não só na cor): "lotada" e "quase lotada" são legíveis sem ver cor.
    expect(await within(day).findByText("9/12 vagas")).toBeInTheDocument();
    expect(within(day).getByText("3/12 vagas · quase lotada")).toBeInTheDocument();
    expect(within(day).getByText("0/10 vagas · lotada")).toBeInTheDocument();
    expect(
      screen.getByText("Disponibilidade sujeita a confirmação no momento da reserva."),
    ).toBeInTheDocument();
  });

  it("marca na agenda as aulas que já reservei", async () => {
    server.use(
      http.get("/api/agenda", () =>
        HttpResponse.json([
          item(TODAY, "07:00", { myReservationId: "res-1" }),
          item(TODAY, "18:00"),
        ]),
      ),
    );

    renderPage();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    const [reserved, open] = await within(day).findAllByRole("button", { name: /Prof\./ });
    expect(reserved).toHaveTextContent("Reservada");
    expect(reserved).not.toHaveTextContent("vagas");
    expect(open).not.toHaveTextContent("Reservada");
    expect(open).toHaveTextContent("9/12 vagas");
    const grid = screen.getByRole("region", { name: "Grade da semana" });
    expect(within(grid).getAllByText("Reservada")).toHaveLength(1);
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
      await user.click(await within(day).findByRole("button", { name: /07h00/ }));
      const sheet = screen.getByRole("dialog", { name: "Treino Funcional" });
      await user.click(within(sheet).getByRole("button", { name: "Remarcar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
