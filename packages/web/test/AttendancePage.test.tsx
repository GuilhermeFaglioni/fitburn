import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  gymDateTimeToUtc,
  Module,
  PermissionAction,
  PermissionScope,
  type AttendanceEntry,
  type AttendanceRoster,
  type AttendanceStatusName,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AttendancePage } from "../src/pages/AttendancePage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
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
    mockSuccessfulLogin("Professor", [
      { module: Module.PRESENCA, actions: [PermissionAction.VIEW, PermissionAction.EXECUTE], scope: PermissionScope.ASSIGNED_CLASSES },
    ]);
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

  it("explica e relê a lista quando a reserva já não aceita presença (cancelada)", async () => {
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
      "A reserva de Marina Souza foi cancelada e não aceita presença.",
    );
    await waitFor(() =>
      expect(within(rowOf("Marina Souza")).getByRole("button", { name: "Faltou" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("corrige uma marcação com um toque no outro botão", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    server.use(
      http.post("/api/attendance/reservations/:reservationId", async ({ params, request }) => {
        marks.push({ reservationId: String(params.reservationId), body: await request.json() });
        return HttpResponse.json(entry("r-bruno", "Bruno Alves", "ABSENT"));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Bruno Alves")).getByRole("button", { name: "Faltou" }));

    expect(within(rowOf("Bruno Alves")).getByRole("button", { name: "Faltou" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(rowOf("Bruno Alves")).getByRole("button", { name: "Presente" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Corrigir não muda quantos já foram registrados nem volta a linha para pendente.
    expect(screen.getByText("2 de 4 registrados")).toBeInTheDocument();
    expect(within(rowOf("Bruno Alves")).queryByText("PENDENTE")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(marks).toEqual([{ reservationId: "r-bruno", body: { status: "ABSENT" } }]),
    );
  });

  it("tocar de novo no botão já marcado não envia nada", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    server.use(
      http.post("/api/attendance/reservations/:reservationId", async ({ params, request }) => {
        marks.push({ reservationId: String(params.reservationId), body: await request.json() });
        return HttpResponse.json(entry("r-bruno", "Bruno Alves", "PRESENT"));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Bruno Alves")).getByRole("button", { name: "Presente" }));

    expect(marks).toEqual([]);
    expect(within(rowOf("Bruno Alves")).getByRole("button", { name: "Presente" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("se a correção falha, a linha volta à marcação anterior e a tela avisa", async () => {
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    server.use(
      http.post("/api/attendance/reservations/:reservationId", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("2 de 4 registrados");

    await user.click(within(rowOf("Bruno Alves")).getByRole("button", { name: "Faltou" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar a presença de Bruno Alves. Tente novamente.",
    );
    expect(within(rowOf("Bruno Alves")).getByRole("button", { name: "Presente" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(rowOf("Bruno Alves")).getByRole("button", { name: "Faltou" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(rowOf("Bruno Alves")).queryByText("PENDENTE")).not.toBeInTheDocument();
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

  // Achado A3 da auditoria (docs/test-matrix.md), corrigido: Presente e Faltou só valem com a ação EXECUTE
  // em Presença.
  it("sem a ação EXECUTE em Presença, os botões Presente e Faltou ficam desabilitados", async () => {
    mockSuccessfulLogin("Professor", [
      { module: Module.PRESENCA, actions: [PermissionAction.VIEW], scope: PermissionScope.ASSIGNED_CLASSES },
    ]);
    mockRoster(rosterOf(DEFAULT_ENTRIES));
    renderPage();

    expect(await screen.findByText("Treino Funcional · Hoje, 17h30")).toBeInTheDocument();
    const marina = within(rowOf("Marina Souza"));
    expect(marina.getByRole("button", { name: "Presente" })).toBeDisabled();
    expect(marina.getByRole("button", { name: "Faltou" })).toBeDisabled();
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

  describe("estrutura e acessibilidade (nova base de design)", () => {
    it("os alunos são uma lista; cada linha tem um grupo com o nome do aluno e os estados em aria-pressed", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      renderPage();

      const list = await screen.findByRole("list");
      expect(within(list).getAllByRole("listitem")).toHaveLength(4);
      expect(screen.getByRole("heading", { level: 1, name: "Presença" })).toBeInTheDocument();

      for (const [name, present, absent] of [
        ["Marina Souza", "false", "false"],
        ["Bruno Alves", "true", "false"],
        ["Camila Duarte", "false", "false"],
        ["Diego Ramos", "false", "true"],
      ]) {
        const group = screen.getByRole("group", { name });
        expect(within(group).getByRole("button", { name: "Presente" })).toHaveAttribute(
          "aria-pressed",
          present,
        );
        expect(within(group).getByRole("button", { name: "Faltou" })).toHaveAttribute(
          "aria-pressed",
          absent,
        );
      }
    });

    it("a contagem do topo é um status e acompanha cada marcação", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      server.use(
        http.post("/api/attendance/reservations/:reservationId", () =>
          HttpResponse.json(entry("r-marina", "Marina Souza", "PRESENT")),
        ),
      );
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByText("2 de 4 registrados")).toHaveAttribute("role", "status");

      await user.click(
        within(screen.getByRole("group", { name: "Marina Souza" })).getByRole("button", {
          name: "Presente",
        }),
      );

      expect(screen.getByText("3 de 4 registrados")).toHaveAttribute("role", "status");
    });

    it("o grupo da linha fica aria-busy enquanto o pedido não volta e só ele", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      server.use(
        http.post("/api/attendance/reservations/:reservationId", async () => {
          await gate;
          return HttpResponse.json(entry("r-marina", "Marina Souza", "PRESENT"));
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("2 de 4 registrados");
      const marina = screen.getByRole("group", { name: "Marina Souza" });
      expect(marina).not.toHaveAttribute("aria-busy");

      await user.click(within(marina).getByRole("button", { name: "Presente" }));

      expect(marina).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("group", { name: "Camila Duarte" })).not.toHaveAttribute("aria-busy");

      release();
      await waitFor(() => expect(marina).not.toHaveAttribute("aria-busy"));
    });

    it("a marcação que o servidor recusou também sai do estado ocupado", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      server.use(
        http.post("/api/attendance/reservations/:reservationId", () =>
          HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro." }, { status: 500 }),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("2 de 4 registrados");
      const marina = screen.getByRole("group", { name: "Marina Souza" });

      await user.click(within(marina).getByRole("button", { name: "Presente" }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      await waitFor(() => expect(marina).not.toHaveAttribute("aria-busy"));
    });

    it("sair com um pedido em andamento não pede confirmação (não há rascunho) e o pedido termina", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      server.use(
        http.post("/api/attendance/reservations/:reservationId", async ({ params, request }) => {
          marks.push({ reservationId: String(params.reservationId), body: await request.json() });
          await gate;
          return HttpResponse.json(entry("r-marina", "Marina Souza", "PRESENT"));
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("2 de 4 registrados");
      await user.click(
        within(screen.getByRole("group", { name: "Marina Souza" })).getByRole("button", {
          name: "Presente",
        }),
      );
      await waitFor(() => expect(marks).toHaveLength(1));

      await user.click(screen.getByRole("button", { name: "Voltar" }));

      expect(await screen.findByRole("heading", { name: "Minhas aulas (tela)" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
      release();
      expect(marks).toEqual([{ reservationId: "r-marina", body: { status: "PRESENT" } }]);
    });
  });

  describe("estados da lista e sem conexão", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
      setBrowserOnline(true);
    });

    it("carregando: mostra o texto da tela e o cabeçalho", async () => {
      server.use(http.get("/api/attendance/classes/occ-1", () => new Promise(() => {})));
      renderPage();

      const loading = await screen.findByText("Carregando a lista de presença…");

      expect(loading).toHaveAttribute("role", "status");
      expect(screen.getByRole("heading", { name: "Presença" })).toBeInTheDocument();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("erro: alerta com o texto da tela e botão para tentar de novo", async () => {
      let calls = 0;
      server.use(
        http.get("/api/attendance/classes/occ-1", () => {
          calls += 1;
          return calls === 1
            ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro." }, { status: 500 })
            : HttpResponse.json(rosterOf(DEFAULT_ENTRIES));
        }),
      );
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível carregar a lista de presença.",
      );

      await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByText("Marina Souza")).toBeInTheDocument();
    });

    it("vazio: o estado da base, com a contagem em zero", async () => {
      mockRoster(rosterOf([]));
      renderPage();

      const empty = await screen.findByText("Nenhum cliente com reserva nesta aula.");

      expect(empty.closest("[data-state]")).toHaveAttribute("data-state", "empty");
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("offline antes de carregar: mostra o estado sem conexão (não um erro) e a lista vem com a rede", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
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

      onlineManager.setOnline(true);
      setBrowserOnline(true);

      expect(await screen.findByText("Marina Souza")).toBeInTheDocument();
    });

    it("offline com a lista aberta: marcar fica desabilitado com o motivo e nada do que está na tela se perde", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      renderPage();
      await screen.findByText("2 de 4 registrados");

      setBrowserOnline(false);

      await screen.findByText(/Sem conexão: registrar presença volta a funcionar/);
      for (const name of ["Marina Souza", "Bruno Alves", "Camila Duarte", "Diego Ramos"]) {
        for (const button of within(screen.getByRole("group", { name })).getAllByRole("button")) {
          expect(button).toBeDisabled();
          expect(button).toHaveAttribute("title", expect.stringMatching(/sem conexão/i));
        }
      }
      // O que já estava marcado continua à mostra.
      expect(screen.getByText("2 de 4 registrados")).toBeInTheDocument();
      expect(
        within(screen.getByRole("group", { name: "Bruno Alves" })).getByRole("button", {
          name: "Presente",
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(within(rowOf("Marina Souza")).getByText("PENDENTE")).toBeInTheDocument();

      setBrowserOnline(true);

      await waitFor(() =>
        expect(
          within(screen.getByRole("group", { name: "Marina Souza" })).getByRole("button", {
            name: "Presente",
          }),
        ).toBeEnabled(),
      );
      expect(screen.queryByText(/Sem conexão: registrar presença/)).toBeNull();
    });

    it("offline depois de marcar: a marcação já feita fica na tela", async () => {
      mockRoster(rosterOf(DEFAULT_ENTRIES));
      server.use(
        http.post("/api/attendance/reservations/:reservationId", () =>
          HttpResponse.json(entry("r-marina", "Marina Souza", "PRESENT")),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("2 de 4 registrados");
      const marina = screen.getByRole("group", { name: "Marina Souza" });
      await user.click(within(marina).getByRole("button", { name: "Presente" }));
      await waitFor(() => expect(marina).not.toHaveAttribute("aria-busy"));

      setBrowserOnline(false);

      await screen.findByText(/Sem conexão: registrar presença/);
      expect(within(marina).getByRole("button", { name: "Presente" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(within(marina).getByRole("button", { name: "Presente" })).toBeDisabled();
      expect(screen.getByText("3 de 4 registrados")).toBeInTheDocument();
    });
  });
});
