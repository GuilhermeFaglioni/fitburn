import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
  gymToday,
  startOfWeek,
  weekdayOf,
  type ClientAgendaItem,
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/agenda"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ClientAgendaPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
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
      expect.stringContaining("07h00 – 08h00 · Prof. Rafael Andrade"),
      expect.stringContaining("18h00 – 19h00 · Prof. Rafael Andrade"),
    ]);
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
    expect(await within(day).findByText("9/12 vagas disponíveis")).toBeInTheDocument();
    expect(within(day).getByText("3/12 vagas · quase lotada")).toBeInTheDocument();
    expect(within(day).getByText("0/10 vagas · lotada")).toBeInTheDocument();
    expect(
      screen.getByText("Disponibilidade sujeita a confirmação no momento da reserva."),
    ).toBeInTheDocument();
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
    expect(sheet).toHaveTextContent("Duração de 60 minutos");
    expect(sheet).toHaveTextContent("3 de 12 vagas restantes");
    expect(within(sheet).getByRole("button", { name: "Reservar" })).toBeEnabled();
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
    await user.click(within(sheet).getByRole("button", { name: "Reservar" }));

    expect(
      await within(sheet).findByText("Reserva confirmada com sucesso. Bom treino!"),
    ).toBeInTheDocument();
    await waitFor(() => expect(agendaRequests).toBeGreaterThan(1));
    expect(await within(sheet).findByText("2 de 12 vagas restantes")).toBeInTheDocument();

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
    await user.click(within(sheet).getByRole("button", { name: "Reservar" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.",
    );
    expect(await within(sheet).findByText("0 de 12 vagas restantes")).toBeInTheDocument();
    const day = screen.getByRole("region", { name: "Aulas do dia" });
    expect(await within(day).findByText("0/12 vagas · lotada")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Reservar" })).not.toBeInTheDocument();
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
    await user.click(within(sheet).getByRole("button", { name: "Reservar" }));
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
    await user.click(within(reopened.sheet).getByRole("button", { name: "Reservar" }));
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
    await user.click(within(sheet).getByRole("button", { name: "Reservar" }));

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
    await user.click(within(sheet).getByRole("button", { name: "Reservar" }));
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
    expect(within(sheet).queryByRole("button", { name: "Reservar" })).not.toBeInTheDocument();
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
