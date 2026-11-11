import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
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
 * Agenda do cliente na base de design (D-038): "Suas aulas | Todas", dias (Chip), modalidades (Pill) e os
 * estados vazio, erro, carregando e sem conexão, nas duas abas.
 */
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
const OTHER_DAY = addDays(TODAY, 1);

function item(date: string, time: string, name: string, overrides: Partial<ClientAgendaItem> = {}): ClientAgendaItem {
  const startsAt = gymDateTimeToUtc(date, time);
  return {
    id: `occ-${date}-${time}-${name}`,
    name,
    description: null,
    modality: { id: `mod-${name}`, name },
    instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    durationMinutes: 45,
    capacity: 12,
    available: 9,
    myReservationId: null,
    ...overrides,
  };
}

function reservation(id: string, date: string, time: string, status: ReservationDetail["status"]): ReservationDetail {
  const startsAt = gymDateTimeToUtc(date, time);
  return {
    id,
    status,
    occurrence: {
      id: `occ-${id}`,
      name: "Mobilidade",
      modality: { id: "mod-m", name: "Mobilidade" },
      instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
      durationMinutes: 45,
      status: "SCHEDULED",
    },
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    login("cliente@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  return ready ? <ClientAgendaPage /> : null;
}

function renderPage(path = "/agenda?aba=todas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function mockAgenda(items: ClientAgendaItem[]) {
  server.use(http.get("/api/agenda", () => HttpResponse.json(items)));
}

function mockReservations(past: ReservationDetail[], upcoming: ReservationDetail[]) {
  server.use(
    http.get("/api/reservations", ({ request }) =>
      HttpResponse.json(new URL(request.url).searchParams.get("when") === "past" ? past : upcoming),
    ),
  );
}

beforeEach(() => {
  mockSuccessfulLogin("Cliente");
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("Agenda: Suas aulas | Todas", () => {
  it("o controle é um grupo rotulado de botões com aria-pressed; troca de aba muda o conteúdo e o kicker", async () => {
    mockAgenda([item(TODAY, "07:00", "Mobilidade")]);
    mockReservations([], [reservation("r-next", addDays(TODAY, 1), "07:00", "CONFIRMED")]);
    renderPage("/agenda");
    const user = userEvent.setup();

    const view = await screen.findByRole("group", { name: "Visão" });
    const mine = within(view).getByRole("button", { name: "Suas aulas" });
    const all = within(view).getByRole("button", { name: "Todas" });
    expect(mine).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("region", { name: "Suas reservas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Aulas do dia" })).not.toBeInTheDocument();
    expect(screen.getByText("Reservas")).toBeInTheDocument();

    await user.click(all);

    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(mine).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("region", { name: "Aulas do dia" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Suas reservas" })).not.toBeInTheDocument();
    expect(screen.getByText(/^Semana de /)).toBeInTheDocument();

    await user.click(mine);
    expect(await screen.findByRole("region", { name: "Suas reservas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Aulas do dia" })).not.toBeInTheDocument();
  });
});

const HISTORY_PATH = "/agenda?aba=suas&ver=historico";

describe("Agenda: Histórico (subvisão de Suas aulas)", () => {
  it("no Histórico, cada situação aparece no texto do selo, inclusive a de presença", async () => {
    mockAgenda([]);
    mockReservations(
      [
        reservation("r-1", addDays(TODAY, -1), "07:00", "COMPLETED"),
        reservation("r-2", addDays(TODAY, -2), "07:00", "NO_SHOW"),
        reservation("r-3", addDays(TODAY, -3), "07:00", "CANCELLED"),
      ],
      [],
    );
    renderPage(HISTORY_PATH);

    const past = await screen.findByRole("region", { name: "Anteriores" });
    expect(await within(past).findByText("CONCLUÍDA")).toBeInTheDocument();
    expect(within(past).getByText("NÃO COMPARECEU")).toBeInTheDocument();
    expect(within(past).getByText("CANCELADA")).toBeInTheDocument();
  });

  it("o filtro de situação do Histórico é um grupo rotulado de pílulas com aria-pressed", async () => {
    mockAgenda([]);
    mockReservations([], []);
    renderPage(HISTORY_PATH);
    const user = userEvent.setup();

    const filter = await screen.findByRole("group", { name: "Filtrar por estado" });
    expect(within(filter).getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(filter).getByRole("button", { name: "Canceladas" }));
    expect(within(filter).getByRole("button", { name: "Canceladas" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filter).getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Agenda: dia e modalidade", () => {
  it("os dias são um grupo rotulado de chips; o dia escolhido fica com aria-pressed e mostra as aulas dele", async () => {
    mockAgenda([item(TODAY, "07:00", "Mobilidade"), item(OTHER_DAY, "10:00", "Yoga")]);
    renderPage();
    const user = userEvent.setup();

    const days = await screen.findByRole("group", { name: "Dia" });
    const todayChip = within(days).getByRole("button", { name: formatDayLabel(TODAY, weekdayOf(TODAY)) });
    const otherChip = within(days).getByRole("button", { name: formatDayLabel(OTHER_DAY, weekdayOf(OTHER_DAY)) });
    // Semana atual: os chips começam em hoje (quarta), então faltam segunda e terça.
    expect(within(days).getAllByRole("button")).toHaveLength(5);
    expect(todayChip).toHaveAttribute("aria-pressed", "true");
    expect(otherChip).toHaveAttribute("aria-pressed", "false");

    await user.click(otherChip);

    expect(otherChip).toHaveAttribute("aria-pressed", "true");
    expect(todayChip).toHaveAttribute("aria-pressed", "false");
    const day = screen.getByRole("region", { name: "Aulas do dia" });
    expect(await within(day).findByText("Yoga")).toBeInTheDocument();
    expect(within(day).queryByText("Mobilidade")).not.toBeInTheDocument();
  });

  it("as modalidades da semana viram pílulas; escolher uma filtra a lista, e Todas volta tudo", async () => {
    mockAgenda([
      item(TODAY, "07:00", "Mobilidade"),
      item(TODAY, "12:00", "Funcional"),
      item(TODAY, "18:00", "Funcional"),
    ]);
    renderPage();
    const user = userEvent.setup();

    const group = await screen.findByRole("group", { name: "Modalidade" });
    const all = within(group).getByRole("button", { name: "Todas" });
    const functional = within(group).getByRole("button", { name: "Funcional" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Todas",
      "Funcional",
      "Mobilidade",
    ]);
    expect(all).toHaveAttribute("aria-pressed", "true");

    const day = screen.getByRole("region", { name: "Aulas do dia" });
    await within(day).findByText("Mobilidade");
    expect(day.querySelectorAll("details")).toHaveLength(3);

    await user.click(functional);

    expect(functional).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(day.querySelectorAll("details")).toHaveLength(2);
    expect(within(day).queryByText("Mobilidade")).not.toBeInTheDocument();

    await user.click(all);
    expect(day.querySelectorAll("details")).toHaveLength(3);
  });

  it("modalidade sem aula no dia escolhido mostra o vazio dizendo qual é o filtro", async () => {
    mockAgenda([item(TODAY, "07:00", "Mobilidade"), item(OTHER_DAY, "10:00", "Funcional")]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Funcional" }));

    const day = screen.getByRole("region", { name: "Aulas do dia" });
    expect(await within(day).findByText("Nenhuma aula de Funcional agendada para este dia.")).toBeInTheDocument();
  });

  it("com uma só modalidade na semana não há filtro de modalidade", async () => {
    mockAgenda([item(TODAY, "07:00", "Mobilidade")]);
    renderPage();

    await within(await screen.findByRole("region", { name: "Aulas do dia" })).findByText("1 aula");
    expect(screen.queryByRole("group", { name: "Modalidade" })).not.toBeInTheDocument();
  });

  it("o selo de vagas diz o nível por extenso, sem depender de cor", async () => {
    mockAgenda([
      item(TODAY, "07:00", "A", { available: 0, capacity: 8 }),
      item(TODAY, "07:00", "B", { available: 2, capacity: 8 }),
      item(TODAY, "07:00", "C", { available: 6, capacity: 8 }),
    ]);
    renderPage();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    expect(await within(day).findByText("0/8 vagas · lotada")).toBeInTheDocument();
    expect(within(day).getByText("2/8 vagas · quase lotada")).toBeInTheDocument();
    expect(within(day).getByText("6/8 vagas")).toBeInTheDocument();
  });
});

describe("Agenda: estados", () => {
  it("carregando: mostra o estado de carregamento enquanto a agenda não chega", async () => {
    server.use(
      http.get("/api/agenda", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json([]);
      }),
    );
    renderPage();

    const loading = await screen.findByText("Carregando…");
    expect(loading.closest('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());
  });

  it("vazio: semana sem aulas mostra o vazio do dia (celular) e o da semana (desktop)", async () => {
    mockAgenda([]);
    renderPage();

    expect(await screen.findByText("Nenhuma aula agendada para este dia.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma aula agendada para esta semana.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Modalidade" })).not.toBeInTheDocument();
  });

  it("erro: mostra a falha como alerta e tenta de novo pelo botão", async () => {
    let calls = 0;
    server.use(
      http.get("/api/agenda", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "X", message: "x" }, { status: 500 })
          : HttpResponse.json([item(TODAY, "07:00", "Mobilidade")]);
      }),
    );
    renderPage();
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar a agenda.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(
      await within(await screen.findByRole("region", { name: "Aulas do dia" })).findByText("1 aula"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offline: sem rede mostra o estado offline (não um erro) e volta sozinho quando a rede volta", async () => {
    onlineManager.setOnline(false);
    mockAgenda([item(TODAY, "07:00", "Mobilidade")]);
    renderPage();

    const offline = await waitFor(() => {
      const found = document.querySelector('[data-state="offline"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
    expect(within(offline).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // O controle e a semana seguem na tela: só a lista espera a rede.
    expect(screen.getByRole("group", { name: "Visão" })).toBeInTheDocument();

    onlineManager.setOnline(true);

    expect(
      await within(await screen.findByRole("region", { name: "Aulas do dia" })).findByText("1 aula"),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-state="offline"]')).toBeNull();
  });
});

describe("Histórico: estados (subvisão de Suas aulas)", () => {
  async function openHistory() {
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Histórico" });
    return user;
  }

  it("vazio: cada seção diz que não há reservas", async () => {
    mockAgenda([]);
    mockReservations([], []);
    renderPage(HISTORY_PATH);
    await openHistory();

    expect(await screen.findByText("Nenhuma reserva próxima.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma reserva anterior.")).toBeInTheDocument();
  });

  it("carregando: cada seção mostra o carregamento", async () => {
    mockAgenda([]);
    server.use(
      http.get("/api/reservations", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json([]);
      }),
    );
    renderPage(HISTORY_PATH);
    await openHistory();

    expect(await screen.findAllByText("Carregando…")).toHaveLength(2);
    expect(await screen.findByText("Nenhuma reserva próxima.")).toBeInTheDocument();
  });

  it("erro: a seção que falha mostra o alerta com nova tentativa", async () => {
    mockAgenda([]);
    server.use(
      http.get("/api/reservations", ({ request }) =>
        new URL(request.url).searchParams.get("when") === "past"
          ? HttpResponse.json({ code: "X", message: "x" }, { status: 500 })
          : HttpResponse.json([]),
      ),
    );
    renderPage(HISTORY_PATH);
    await openHistory();

    const past = await screen.findByRole("region", { name: "Anteriores" });
    const alert = await within(past).findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar suas reservas.");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma reserva próxima.")).toBeInTheDocument();
  });

  it("offline: sem rede as seções mostram o estado offline e carregam quando a rede volta", async () => {
    mockAgenda([]);
    mockReservations([reservation("r-1", addDays(TODAY, -1), "07:00", "COMPLETED")], []);
    renderPage(HISTORY_PATH);
    const user = await openHistory();
    await screen.findByRole("region", { name: "Anteriores" });
    await user.click(screen.getByRole("button", { name: "Canceladas" }));
    onlineManager.setOnline(false);
    await user.click(screen.getByRole("button", { name: "Concluídas" }));

    await waitFor(() => expect(document.querySelectorAll('[data-state="offline"]')).toHaveLength(2));

    onlineManager.setOnline(true);

    expect(await screen.findByText("CONCLUÍDA")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-state="offline"]')).toHaveLength(0);
  });
});
