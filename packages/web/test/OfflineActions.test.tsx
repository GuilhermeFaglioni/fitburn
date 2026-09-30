import { useEffect, useState, type ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  gymDateTimeToUtc,
  gymToday,
  Module,
  PermissionAction,
  PermissionScope,
  type AttendanceRoster,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { AppShell } from "../src/components/AppShell";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AttendancePage } from "../src/pages/AttendancePage";
import { ClientAgendaPage } from "../src/pages/ClientAgendaPage";
import { LoginPage } from "../src/pages/LoginPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

/** Casca completa (banner global incluído) com sessão já aberta. */
function renderLoggedIn(page: ReactNode, path: string, routePath = path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Session() {
    const { login } = useAuth();
    const [ready, setReady] = useState(false);
    useEffect(() => {
      void login("usuario@fitburn.local", "SenhaForte123!").then(() => setReady(true));
    }, [login]);
    if (!ready) return null;
    return (
      <Routes>
        <Route path={routePath} element={page} />
      </Routes>
    );
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppShell>
            <Session />
          </AppShell>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Sem conexão: ações que exigem rede ficam desabilitadas", () => {
  describe("Reservar aula (cliente)", () => {
    const startsAt = gymDateTimeToUtc(gymToday(), "18:00");
    const occurrence: ClientAgendaItem = {
      id: "occ-1",
      name: "Treino Funcional",
      description: "Circuito de força.",
      modality: { id: "mod-1", name: "Treino Funcional" },
      instructor: { id: "user-rafael", fullName: "Rafael Andrade" },
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      capacity: 12,
      available: 9,
      myReservationId: null,
    };

    beforeEach(() => {
      mockSuccessfulLogin("Cliente");
      server.use(
        http.get("/api/agenda", () => HttpResponse.json([occurrence])),
        http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)),
      );
    });

    async function openDetail() {
      const user = userEvent.setup();
      const day = await screen.findByRole("region", { name: "Aulas do dia" });
      await user.click(await within(day).findByRole("button", { name: /Treino Funcional/ }));
      return { user, sheet: await screen.findByRole("dialog", { name: "Treino Funcional" }) };
    }

    it("com o navegador offline, mostra o banner e desabilita Reservar; ao voltar, reabilita", async () => {
      renderLoggedIn(<ClientAgendaPage />, "/agenda");
      const { sheet } = await openDetail();
      expect(within(sheet).getByRole("button", { name: "Reservar" })).toBeEnabled();

      act(() => setBrowserOnline(false));

      expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
      expect(within(sheet).getByRole("button", { name: "Reservar" })).toBeDisabled();

      act(() => setBrowserOnline(true));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Reservar" })).toBeEnabled();
    });

    it("uma falha de rede na agenda derruba a conexão: banner e Reservar desabilitado até a API responder", async () => {
      renderLoggedIn(<ClientAgendaPage />, "/agenda");
      const { user, sheet } = await openDetail();
      // Rede fora do ar de verdade: nenhuma rota responde até a API voltar.
      let apiUp = false;
      const whenUp = (body: unknown) => () =>
        apiUp ? HttpResponse.json(body as object) : HttpResponse.error();
      server.use(
        http.post("/api/reservations", () => HttpResponse.error()),
        http.get("/api/agenda", whenUp([occurrence])),
        http.get("/api/agenda/:id", whenUp(occurrence)),
        http.get("/api/health", whenUp({ status: "ok" })),
      );

      await user.click(within(sheet).getByRole("button", { name: "Reservar" }));

      expect(await screen.findByText("Sem conexão.")).toBeInTheDocument();
      // O reenvio idempotente da própria tela continua disponível para o resultado incerto.
      expect(within(sheet).getByRole("button", { name: "Tentar novamente" })).toBeEnabled();

      apiUp = true;
      await user.click(screen.getByRole("button", { name: "Verificar conexão" }));

      await waitFor(() => expect(screen.queryByText("Sem conexão.")).not.toBeInTheDocument());
    });
  });

  describe("Registrar presença (professor)", () => {
    const startsAt = new Date(Date.now() - 30 * 60_000);
    const roster: AttendanceRoster = {
      class: {
        id: "occ-1",
        name: "Treino Funcional",
        modality: { id: "mod-1", name: "Treino Funcional" },
        instructor: { id: "user-1", fullName: "Rafael Andrade" },
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        durationMinutes: 60,
        totalCount: 1,
        registeredCount: 0,
      },
      entries: [
        { reservationId: "r-marina", client: { id: "c-1", fullName: "Marina Souza" }, status: "PENDING" },
      ],
    };

    const EXECUTE_ATTENDANCE = [
      { module: Module.PRESENCA, actions: [PermissionAction.VIEW, PermissionAction.EXECUTE], scope: PermissionScope.ASSIGNED_CLASSES },
    ];

    it("sem a ação EXECUTE, Presente e Faltou continuam desabilitados com ou sem conexão (um motivo não reabilita o outro)", async () => {
      mockSuccessfulLogin("Professor", [
        { module: Module.PRESENCA, actions: [PermissionAction.VIEW], scope: PermissionScope.ASSIGNED_CLASSES },
      ]);
      server.use(http.get("/api/attendance/classes/occ-1", () => HttpResponse.json(roster)));
      renderLoggedIn(<AttendancePage />, "/presenca/occ-1", "/presenca/:occurrenceId");
      const row = (await screen.findByText("Marina Souza")).closest("li")!;
      const presente = within(row).getByRole("button", { name: "Presente" });
      expect(presente).toBeDisabled();
      expect(presente).toHaveAttribute("title", "Você não tem permissão para registrar presença.");

      act(() => setBrowserOnline(false));
      expect(within(row).getByRole("button", { name: "Presente" })).toBeDisabled();
      expect(within(row).getByRole("button", { name: "Faltou" })).toBeDisabled();

      act(() => setBrowserOnline(true));
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      expect(within(row).getByRole("button", { name: "Presente" })).toBeDisabled();
      expect(within(row).getByRole("button", { name: "Faltou" })).toBeDisabled();
    });

    it("Presente e Faltou ficam desabilitados sem conexão e nenhuma requisição é enviada", async () => {
      mockSuccessfulLogin("Professor", EXECUTE_ATTENDANCE);
      let marks = 0;
      server.use(
        http.get("/api/attendance/classes/occ-1", () => HttpResponse.json(roster)),
        http.post("/api/attendance/reservations/:id", () => {
          marks += 1;
          return HttpResponse.json({});
        }),
      );
      renderLoggedIn(<AttendancePage />, "/presenca/occ-1", "/presenca/:occurrenceId");
      const row = (await screen.findByText("Marina Souza")).closest("li")!;
      expect(within(row).getByRole("button", { name: "Presente" })).toBeEnabled();

      act(() => setBrowserOnline(false));
      await userEvent.setup().click(within(row).getByRole("button", { name: "Presente" }));

      expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
      expect(within(row).getByRole("button", { name: "Presente" })).toBeDisabled();
      expect(within(row).getByRole("button", { name: "Faltou" })).toBeDisabled();
      expect(marks).toBe(0);
    });
  });

  describe("Entrar", () => {
    it("o botão Entrar fica desabilitado sem conexão, com o aviso na tela", () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={["/login"]}>
            <AppShell>
              <LoginPage />
            </AppShell>
          </MemoryRouter>
        </AuthProvider>,
      );
      act(() => setBrowserOnline(false));

      expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
      expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    });

    it("abrir o app sem rede não trava a casca: mostra o login e o aviso de sem conexão", async () => {
      server.use(http.post("/api/auth/refresh", () => HttpResponse.error()));

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={["/login"]}>
            <AppShell>
              <LoginPage />
            </AppShell>
          </MemoryRouter>
        </AuthProvider>,
      );

      expect(await screen.findByRole("heading", { name: "Bem-vindo de volta" })).toBeInTheDocument();
      expect(await screen.findByText("Sem conexão.")).toBeInTheDocument();
    });
  });
});
