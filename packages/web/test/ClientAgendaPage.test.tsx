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

  it("abre o detalhe da aula com a descrição, sem ação de reserva", async () => {
    const occurrence = item(TODAY, "18:00", { available: 3 });
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([occurrence])),
      http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
    );

    renderPage();
    const user = userEvent.setup();

    const day = await screen.findByRole("region", { name: "Aulas do dia" });
    await user.click(await within(day).findByRole("button", { name: /18h00/ }));

    const sheet = screen.getByRole("dialog", { name: "Treino Funcional" });
    expect(sheet).toHaveTextContent("Circuito com estímulos de força e resistência.");
    expect(sheet).toHaveTextContent("Duração de 60 minutos");
    expect(sheet).toHaveTextContent("3 de 12 vagas restantes");
    expect(within(sheet).queryByRole("button", { name: "Reservar" })).not.toBeInTheDocument();
  });
});
