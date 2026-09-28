import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { addDays, gymDateTimeToUtc, gymToday, type ReservationDetail } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientAgendaPage } from "../src/pages/ClientAgendaPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const TODAY = gymToday();

function reservation(
  id: string,
  date: string,
  time: string,
  overrides: Partial<ReservationDetail> & { name?: string } = {},
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
      instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: "SCHEDULED",
    },
    createdAt: new Date().toISOString(),
    cancelledAt: null,
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

describe("Agenda › Histórico (minhas reservas)", () => {
  const requests: URLSearchParams[] = [];

  beforeEach(() => {
    requests.length = 0;
    mockSuccessfulLogin("Cliente");
    server.use(
      http.get("/api/agenda", () => HttpResponse.json([])),
      http.get("/api/reservations", ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        if (params.get("when") === "past") {
          return HttpResponse.json([
            reservation("r-past", addDays(TODAY, -2), "07:00", {
              name: "Spinning",
              status: "NO_SHOW",
            }),
          ]);
        }
        const upcoming = [
          reservation("r-1", addDays(TODAY, 1), "18:00"),
          reservation("r-2", addDays(TODAY, 3), "07:00", {
            name: "Yoga",
            status: "CANCELLED",
            cancelledAt: new Date().toISOString(),
          }),
        ];
        const status = params.get("status");
        return HttpResponse.json(status ? upcoming.filter((r) => r.status === status) : upcoming);
      }),
    );
  });

  async function openHistory() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Histórico" }));
    return user;
  }

  it("a aba Histórico lista as próximas reservas e as anteriores, com o estado de cada uma", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Próximas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await openHistory();

    const upcoming = await screen.findByRole("region", { name: "Próximas reservas" });
    const items = await within(upcoming).findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Treino Funcional");
    // Amanhã: continua clicável seja qual for a hora em que o teste roda.
    expect(items[0]).toHaveTextContent("18h00 · Prof. Rafael Andrade");
    expect(items[0]).toHaveTextContent("CONFIRMADA");
    expect(items[1]).toHaveTextContent("CANCELADA");

    const past = screen.getByRole("region", { name: "Anteriores" });
    expect(await within(past).findByText("NÃO COMPARECEU")).toBeInTheDocument();
    expect(within(past).getByText("Spinning")).toBeInTheDocument();
    expect(requests.map((params) => params.get("when")).sort()).toEqual(["past", "upcoming"]);
  });

  it("filtra por estado", async () => {
    renderPage();
    const user = await openHistory();
    const upcoming = await screen.findByRole("region", { name: "Próximas reservas" });
    await within(upcoming).findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: "Canceladas" }));

    await waitFor(() =>
      expect(requests.filter((params) => params.get("status") === "CANCELLED")).toHaveLength(2),
    );
    await waitFor(() => expect(within(upcoming).getAllByRole("listitem")).toHaveLength(1));
    expect(within(upcoming).getByText("Yoga")).toBeInTheDocument();
  });

  it("mostra estado vazio", async () => {
    server.use(http.get("/api/reservations", () => HttpResponse.json([])));

    renderPage();
    await openHistory();

    expect(await screen.findByText("Nenhuma reserva próxima.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma reserva anterior.")).toBeInTheDocument();
  });

  it("abre o detalhe da aula a partir de uma reserva futura", async () => {
    const detail = reservation("r-1", addDays(TODAY, 1), "18:00");
    server.use(
      http.get("/api/agenda/:id", ({ params }) =>
        HttpResponse.json({
          id: params.id,
          name: detail.occurrence.name,
          description: "Circuito com estímulos de força e resistência.",
          modality: detail.occurrence.modality,
          instructor: detail.occurrence.instructor,
          startsAt: detail.occurrence.startsAt,
          endsAt: detail.occurrence.endsAt,
          durationMinutes: 60,
          capacity: 12,
          available: 5,
          myReservationId: "r-1",
        }),
      ),
    );

    renderPage();
    const user = await openHistory();
    const upcoming = await screen.findByRole("region", { name: "Próximas reservas" });

    await user.click(await within(upcoming).findByRole("button", { name: /Treino Funcional/ }));

    const sheet = await screen.findByRole("dialog", { name: "Treino Funcional" });
    expect(within(sheet).getByText("RESERVA CONFIRMADA")).toBeInTheDocument();
  });

  it("aula que saiu da agenda avisa em vez de abrir o detalhe", async () => {
    server.use(
      http.get("/api/agenda/:id", () =>
        HttpResponse.json({ code: "NOT_FOUND", message: "Aula não encontrada." }, { status: 404 }),
      ),
    );

    renderPage();
    const user = await openHistory();
    const upcoming = await screen.findByRole("region", { name: "Próximas reservas" });
    await user.click(await within(upcoming).findByRole("button", { name: /Treino Funcional/ }));

    expect(await within(upcoming).findByRole("alert")).toHaveTextContent(
      "Esta aula não está mais disponível na agenda",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
