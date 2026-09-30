import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { gymDateTimeToUtc, type AttendanceClass } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { MyClassesPage } from "../src/pages/MyClassesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

// Quarta-feira 06/05/2026, 18h00 na academia (America/Sao_Paulo, UTC-3).
const NOW = new Date("2026-05-06T21:00:00Z");

function occurrence(
  id: string,
  date: string,
  time: string,
  overrides: Partial<AttendanceClass> = {},
): AttendanceClass {
  const startsAt = gymDateTimeToUtc(date, time);
  return {
    id,
    name: "Treino Funcional",
    modality: { id: "mod-1", name: "Treino Funcional" },
    // "user-1" é o usuário logado do mockSuccessfulLogin: as aulas são dele.
    instructor: { id: "user-1", fullName: "Rafael Andrade" },
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    totalCount: 0,
    registeredCount: 0,
    ...overrides,
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("rafael@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <MyClassesPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/minhas-aulas"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Minhas aulas", () => {
  const requests: URLSearchParams[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    requests.length = 0;
    mockSuccessfulLogin("Professor");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockClasses(classes: AttendanceClass[]) {
    server.use(
      http.get("/api/attendance/classes", ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(classes);
      }),
    );
  }

  it("abre no dia de hoje, com o andamento de cada aula e um atalho para registrar a presença", async () => {
    mockClasses([
      occurrence("occ-morning", "2026-05-06", "07:00", {
        name: "Spinning",
        totalCount: 3,
        registeredCount: 3,
      }),
      occurrence("occ-noon", "2026-05-06", "12:00", { name: "Yoga" }),
      occurrence("occ-now", "2026-05-06", "17:30", { totalCount: 4, registeredCount: 2 }),
      occurrence("occ-night", "2026-05-06", "19:00", { name: "HIIT", totalCount: 5 }),
    ]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Minhas aulas" })).toBeInTheDocument();
    // O título aparece antes de a consulta sair: espera a requisição ser registrada.
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0].get("from")).toBe("2026-05-06");
    expect(requests[0].get("to")).toBe("2026-05-06");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveClass("active");

    const spinning = await screen.findByRole("link", { name: /Spinning/ });
    expect(spinning).toHaveAttribute("href", "/presenca/occ-morning");
    expect(within(spinning).getByText("07h00")).toBeInTheDocument();
    expect(within(spinning).getByText("Tudo registrado")).toBeInTheDocument();
    expect(within(spinning).getByText("3 de 3 registrados")).toBeInTheDocument();

    const yoga = screen.getByRole("link", { name: /Yoga/ });
    expect(within(yoga).getByText("Sem reservas")).toBeInTheDocument();

    const funcional = screen.getByRole("link", { name: /Treino Funcional/ });
    expect(funcional).toHaveAttribute("href", "/presenca/occ-now");
    expect(within(funcional).getByText("2 pendentes")).toBeInTheDocument();
    expect(within(funcional).getByText("2 de 4 registrados")).toBeInTheDocument();

    // Ainda não começou: nada a registrar, só as reservas até agora.
    const hiit = screen.getByRole("link", { name: /HIIT/ });
    expect(within(hiit).getByText("5 reservas")).toBeInTheDocument();
  });

  it("no singular: uma pendente e uma reserva", async () => {
    mockClasses([
      occurrence("occ-a", "2026-05-06", "07:00", {
        name: "Spinning",
        totalCount: 3,
        registeredCount: 2,
      }),
      occurrence("occ-b", "2026-05-06", "19:00", { name: "HIIT", totalCount: 1 }),
    ]);

    renderPage();

    expect(
      within(await screen.findByRole("link", { name: /Spinning/ })).getByText("1 pendente"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /HIIT/ })).getByText("1 reserva"),
    ).toBeInTheDocument();
  });

  it("na aba Semana lista a semana de segunda a domingo, agrupada por dia", async () => {
    mockClasses([
      occurrence("occ-wed", "2026-05-06", "17:30", { name: "Treino Funcional" }),
      occurrence("occ-thu", "2026-05-07", "07:00", { name: "Spinning" }),
    ]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Minhas aulas" });

    await user.click(screen.getByRole("button", { name: "Semana" }));

    expect(
      await screen.findByRole("heading", { name: "Hoje, quarta-feira 6" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quinta-feira 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semana" })).toHaveClass("active");
    const weekRequest = requests[requests.length - 1];
    expect(weekRequest.get("from")).toBe("2026-05-04");
    expect(weekRequest.get("to")).toBe("2026-05-10");
    const thursday = screen.getByRole("heading", { name: "Quinta-feira 7" }).closest("section")!;
    expect(within(thursday).getByRole("link", { name: /Spinning/ })).toHaveAttribute(
      "href",
      "/presenca/occ-thu",
    );
  });

  it("mostra o professor só nas aulas de outra pessoa (quem enxerga mais que as próprias)", async () => {
    mockClasses([
      occurrence("occ-mine", "2026-05-06", "07:00", { name: "Spinning" }),
      occurrence("occ-other", "2026-05-06", "09:00", {
        name: "Yoga",
        instructor: { id: "user-outro", fullName: "Paula Lima" },
      }),
      occurrence("occ-none", "2026-05-06", "10:00", { name: "HIIT", instructor: null }),
    ]);

    renderPage();

    expect(
      within(await screen.findByRole("link", { name: /Spinning/ })).queryByText(/Prof\./),
    ).toBeNull();
    expect(
      within(screen.getByRole("link", { name: /Yoga/ })).getByText(/Prof\. Paula Lima/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /HIIT/ })).getByText(/Sem professor/),
    ).toBeInTheDocument();
  });

  it("dia sem aulas mostra o estado vazio", async () => {
    mockClasses([]);

    renderPage();

    expect(await screen.findByText("Nenhuma aula hoje.")).toBeInTheDocument();
  });

  it("semana sem aulas mostra o estado vazio", async () => {
    mockClasses([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nenhuma aula hoje.");

    await user.click(screen.getByRole("button", { name: "Semana" }));

    expect(await screen.findByText("Nenhuma aula nesta semana.")).toBeInTheDocument();
  });

  it("avisa quando as aulas não carregam", async () => {
    server.use(
      http.get("/api/attendance/classes", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as aulas.",
    );
  });
});
