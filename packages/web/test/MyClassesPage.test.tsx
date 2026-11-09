import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { gymDateTimeToUtc, type AttendanceClass } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { MyClassesPage } from "../src/pages/MyClassesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
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

  /** A linha da aula: o `li` que traz o nome dela. */
  function rowOf(name: string): HTMLElement {
    return screen.getByText(name, { selector: "b" }).closest("li")!;
  }

  it("abre no dia de hoje, com o andamento de cada aula e o botão que abre a presença", async () => {
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

    expect(await screen.findByRole("heading", { level: 1, name: "Minhas aulas" })).toBeInTheDocument();
    // O título aparece antes de a consulta sair: espera a requisição ser registrada.
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0].get("from")).toBe("2026-05-06");
    expect(requests[0].get("to")).toBe("2026-05-06");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "false");

    // A lista de aulas é uma lista: um item por aula, na ordem da API.
    await screen.findByText("Spinning", { selector: "b" });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    const spinning = within(rowOf("Spinning"));
    expect(spinning.getByText("07h00")).toBeInTheDocument();
    expect(spinning.getByText("Tudo registrado")).toBeInTheDocument();
    expect(spinning.getByText("3 de 3 registrados")).toBeInTheDocument();
    // Tudo registrado: o botão só abre a presença; o nome diz de qual aula é.
    expect(spinning.getByRole("link", { name: "Ver presença: Spinning, 07h00" })).toHaveAttribute(
      "href",
      "/presenca/occ-morning",
    );

    const yoga = within(rowOf("Yoga"));
    expect(yoga.getByText("Sem reservas")).toBeInTheDocument();
    expect(yoga.getByRole("link", { name: /Ver presença/ })).toBeInTheDocument();

    // Já começou e falta registrar: o botão convida a registrar.
    const funcional = within(rowOf("Treino Funcional"));
    expect(funcional.getByText("2 pendentes")).toBeInTheDocument();
    expect(funcional.getByText("2 de 4 registrados")).toBeInTheDocument();
    expect(
      funcional.getByRole("link", { name: "Registrar presença: Treino Funcional, 17h30" }),
    ).toHaveAttribute("href", "/presenca/occ-now");

    // Ainda não começou: nada a registrar, só as reservas até agora.
    const hiit = within(rowOf("HIIT"));
    expect(hiit.getByText("5 reservas")).toBeInTheDocument();
    expect(hiit.getByRole("link", { name: /Ver presença/ })).toBeInTheDocument();
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

    await screen.findByText("Spinning", { selector: "b" });
    expect(within(rowOf("Spinning")).getByText("1 pendente")).toBeInTheDocument();
    expect(within(rowOf("HIIT")).getByText("1 reserva")).toBeInTheDocument();
  });

  it("troca de período: Semana lista de segunda a domingo, agrupada por dia, e Hoje volta ao dia", async () => {
    mockClasses([
      occurrence("occ-wed", "2026-05-06", "17:30", { name: "Treino Funcional" }),
      occurrence("occ-thu", "2026-05-07", "07:00", { name: "Spinning" }),
    ]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Minhas aulas" });

    await user.click(screen.getByRole("button", { name: "Semana" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Hoje, quarta-feira 6" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Quinta-feira 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
    const weekRequest = requests[requests.length - 1];
    expect(weekRequest.get("from")).toBe("2026-05-04");
    expect(weekRequest.get("to")).toBe("2026-05-10");
    const thursday = screen.getByRole("heading", { name: "Quinta-feira 7" }).closest("section")!;
    expect(within(thursday).getByRole("link", { name: /Spinning/ })).toHaveAttribute(
      "href",
      "/presenca/occ-thu",
    );

    await user.click(screen.getByRole("button", { name: "Hoje" }));

    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const last = requests[requests.length - 1];
      expect(last.get("from")).toBe("2026-05-06");
      expect(last.get("to")).toBe("2026-05-06");
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("o seletor de período é um grupo rotulado", async () => {
    mockClasses([]);
    renderPage();

    const group = await screen.findByRole("group", { name: "Período" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Hoje",
      "Semana",
    ]);
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

    await screen.findByText("Spinning", { selector: "b" });
    expect(within(rowOf("Spinning")).queryByText(/Prof\./)).toBeNull();
    expect(within(rowOf("Yoga")).getByText(/Prof\. Paula Lima/)).toBeInTheDocument();
    expect(within(rowOf("HIIT")).getByText(/Sem professor/)).toBeInTheDocument();
  });

  it("a exportação segue o período escolhido e usa o botão da base", async () => {
    mockClasses([]);
    renderPage();

    const button = await screen.findByRole("button", { name: "Exportar presenças (CSV)" });

    expect(button).toHaveClass("fb-ui-btn");
  });

  describe("estados", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
      setBrowserOnline(true);
    });

    it("carregando: mostra o texto da tela, sem esconder o título e o período", async () => {
      server.use(http.get("/api/attendance/classes", () => new Promise(() => {})));
      renderPage();

      const loading = await screen.findByText("Carregando as aulas…");

      expect(loading).toHaveAttribute("role", "status");
      expect(screen.getByRole("heading", { name: "Minhas aulas" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Período" })).toBeInTheDocument();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("dia sem aulas mostra o estado vazio", async () => {
      mockClasses([]);

      renderPage();

      const empty = await screen.findByText("Nenhuma aula hoje.");
      expect(empty.closest("[data-state]")).toHaveAttribute("data-state", "empty");
    });

    it("semana sem aulas mostra o estado vazio", async () => {
      mockClasses([]);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Nenhuma aula hoje.");

      await user.click(screen.getByRole("button", { name: "Semana" }));

      expect(await screen.findByText("Nenhuma aula nesta semana.")).toBeInTheDocument();
    });

    it("erro: avisa que as aulas não carregaram e tenta de novo", async () => {
      let calls = 0;
      server.use(
        http.get("/api/attendance/classes", () => {
          calls += 1;
          return calls === 1
            ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 })
            : HttpResponse.json([occurrence("occ-a", "2026-05-06", "07:00", { name: "Spinning" })]);
        }),
      );
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível carregar as aulas.",
      );

      await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByText("Spinning", { selector: "b" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("offline: mostra o estado sem conexão (não um erro) e a lista volta com a rede", async () => {
      mockClasses([occurrence("occ-a", "2026-05-06", "07:00", { name: "Spinning" })]);
      onlineManager.setOnline(false);
      setBrowserOnline(false);
      renderPage();

      const offline = await waitFor(() => {
        const found = document.querySelector('[data-state="offline"]');
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      expect(offline).toHaveTextContent("Sem conexão");
      expect(screen.queryByRole("alert")).toBeNull();
      // A exportação exige rede: fica desabilitada com o motivo.
      expect(screen.getByRole("button", { name: "Exportar presenças (CSV)" })).toBeDisabled();

      onlineManager.setOnline(true);
      setBrowserOnline(true);

      expect(await screen.findByText("Spinning", { selector: "b" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Exportar presenças (CSV)" })).toBeEnabled();
    });
  });
});
