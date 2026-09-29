import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  gymDateTimeToUtc,
  type AttendanceEntry,
  type AttendanceRoster,
  type AttendanceStatusName,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AttendancePage } from "../src/pages/AttendancePage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

// Quarta-feira 06/05/2026, 18h00 na academia (America/Sao_Paulo, UTC-3).
const NOW = new Date("2026-05-06T21:00:00Z");

function entry(
  reservationId: string,
  fullName: string,
  status: AttendanceStatusName = "PENDING",
): AttendanceEntry {
  return { reservationId, client: { id: `client-${reservationId}`, fullName }, status };
}

function rosterOf(entries: AttendanceEntry[], startsAt = gymDateTimeToUtc("2026-05-06", "17:30")) {
  const registered = entries.filter((item) => item.status !== "PENDING").length;
  return {
    class: {
      id: "occ-1",
      name: "Treino Funcional",
      modality: { id: "mod-1", name: "Treino Funcional" },
      instructor: { id: "user-1", fullName: "Rafael Andrade" },
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      totalCount: entries.length,
      registeredCount: registered,
    },
    entries,
  } satisfies AttendanceRoster;
}

const DEFAULT_ENTRIES = [
  entry("r-marina", "Marina Souza"),
  entry("r-bruno", "Bruno Alves", "PRESENT"),
  entry("r-camila", "Camila Duarte"),
  entry("r-diego", "Diego Ramos", "ABSENT"),
];

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("rafael@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return (
    <Routes>
      <Route path="/presenca/:occurrenceId" element={<AttendancePage />} />
      <Route path="/minhas-aulas" element={<h1>Minhas aulas (tela)</h1>} />
    </Routes>
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/presenca/occ-1"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function rowOf(name: string) {
  return screen.getByText(name).closest("li")!;
}

describe("Presença (professor)", () => {
  const marks: Array<{ reservationId: string; body: unknown }> = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    marks.length = 0;
    mockSuccessfulLogin("Professor");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockRoster(roster: AttendanceRoster) {
    server.use(http.get("/api/attendance/classes/occ-1", () => HttpResponse.json(roster)));
  }

  it("mostra a aula, o andamento e cada cliente com a situação atual", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));

    renderPage();

    expect(await screen.findByText("Treino Funcional · Hoje, 17h30")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presença" })).toBeInTheDocument();
    expect(screen.getByText("2 de 4 registrados")).toBeInTheDocument();
    // A aula já começou: nada de aviso de "abre no início" nem botões travados.
    expect(screen.queryByText(/A presença abre no início da aula/)).not.toBeInTheDocument();
    expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" })).toBeEnabled();

    expect(within(rowOf("Marina Souza")).getByText("PENDENTE")).toBeInTheDocument();
    expect(within(rowOf("Camila Duarte")).getByText("PENDENTE")).toBeInTheDocument();
    expect(within(rowOf("Bruno Alves")).queryByText("PENDENTE")).not.toBeInTheDocument();
    expect(within(rowOf("Bruno Alves")).getByRole("button", { name: "Presente" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(rowOf("Diego Ramos")).getByRole("button", { name: "Faltou" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("marca presente com um toque: a linha muda na hora, sem esperar o servidor", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    let releaseServer!: () => void;
    const serverGate = new Promise<void>((resolve) => (releaseServer = resolve));
    server.use(
      http.post("/api/attendance/reservations/:reservationId", async ({ params, request }) => {
        marks.push({ reservationId: String(params.reservationId), body: await request.json() });
        await serverGate;
        return HttpResponse.json(entry("r-marina", "Marina Souza", "PRESENT"));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" }));

    // O servidor ainda não respondeu e a tela já reflete o registro.
    expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(rowOf("Marina Souza")).queryByText("PENDENTE")).not.toBeInTheDocument();
    expect(screen.getByText("3 de 4 registrados")).toBeInTheDocument();
    await waitFor(() => expect(marks).toHaveLength(1));
    expect(marks[0]).toEqual({ reservationId: "r-marina", body: { status: "PRESENT" } });

    releaseServer();
    await waitFor(() =>
      expect(
        within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("marca faltou", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    server.use(
      http.post("/api/attendance/reservations/:reservationId", async ({ params, request }) => {
        marks.push({ reservationId: String(params.reservationId), body: await request.json() });
        return HttpResponse.json(entry("r-camila", "Camila Duarte", "ABSENT"));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Camila Duarte")).getByRole("button", { name: "Faltou" }));

    expect(within(rowOf("Camila Duarte")).getByRole("button", { name: "Faltou" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("3 de 4 registrados")).toBeInTheDocument();
    await waitFor(() =>
      expect(marks).toEqual([{ reservationId: "r-camila", body: { status: "ABSENT" } }]),
    );
  });

  it("desfaz a marcação e avisa quando o servidor recusa", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    server.use(
      http.post("/api/attendance/reservations/:reservationId", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar a presença de Marina Souza. Tente novamente.",
    );
    expect(within(rowOf("Marina Souza")).getByText("PENDENTE")).toBeInTheDocument();
    expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" })).toBeEnabled();
    expect(screen.getByText("2 de 4 registrados")).toBeInTheDocument();
  });

  it("mostra o que o servidor diz quando a reserva já não aceita presença", async () => {
    let served = 0;
    server.use(
      http.get("/api/attendance/classes/occ-1", () => {
        served += 1;
        // Depois da recusa, a lista é relida: outra pessoa já tinha registrado a Marina.
        return HttpResponse.json(
          rosterOf(
            served === 1
              ? DEFAULT_ENTRIES
              : [entry("r-marina", "Marina Souza", "ABSENT"), ...DEFAULT_ENTRIES.slice(1)],
          ),
        );
      }),
      http.post("/api/attendance/reservations/:reservationId", () =>
        HttpResponse.json(
          { code: "RESERVATION_NOT_ATTENDABLE", message: "Reserva sem presença aberta." },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A presença de Marina Souza já foi registrada ou a reserva foi cancelada.",
    );
    await waitFor(() =>
      expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Faltou" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("não deixa mudar quem já tem presença registrada", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    renderPage();
    await screen.findByText("2 de 4 registrados");

    for (const button of within(rowOf("Bruno Alves")).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    for (const button of within(rowOf("Marina Souza")).getAllByRole("button")) {
      expect(button).toBeEnabled();
    }
  });

  it("antes do início da aula, avisa quando abre e não deixa marcar", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES, gymDateTimeToUtc("2026-05-06", "19:00")));
    renderPage();

    expect(
      await screen.findByText("A presença abre no início da aula, às 19h00."),
    ).toBeInTheDocument();
    for (const button of within(rowOf("Marina Souza")).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("a presença abre sozinha quando a aula começa com a tela aberta", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES, new Date(NOW.getTime() + 200)));
    renderPage();
    expect(await screen.findByText(/A presença abre no início da aula/)).toBeInTheDocument();
    expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" })).toBeDisabled();

    vi.setSystemTime(new Date(NOW.getTime() + 1_000));

    await waitFor(() =>
      expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Presente" })).toBeEnabled(),
    );
    expect(screen.queryByText(/A presença abre no início da aula/)).not.toBeInTheDocument();
  });

  it("aula sem reservas mostra o estado vazio", async () => {
    mockRoster(rosterOf([]));
    renderPage();

    expect(await screen.findByText("Nenhum cliente com reserva nesta aula.")).toBeInTheDocument();
    expect(screen.getByText("0 de 0 registrados")).toBeInTheDocument();
  });

  it("avisa quando a lista não carrega e volta para Minhas aulas", async () => {
    server.use(
      http.get("/api/attendance/classes/occ-1", () =>
        HttpResponse.json({ code: "OUT_OF_SCOPE", message: "Fora do escopo." }, { status: 403 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a lista de presença.",
    );

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(await screen.findByRole("heading", { name: "Minhas aulas (tela)" })).toBeInTheDocument();
  });
});
