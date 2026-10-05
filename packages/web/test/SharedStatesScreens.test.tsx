import { useEffect, useState, type ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientAgendaPage } from "../src/pages/ClientAgendaPage";
import { ClientWorkoutSheetsPage } from "../src/pages/ClientWorkoutSheetsPage";
import { ClientsPage } from "../src/pages/ClientsPage";
import { DashboardPage } from "../src/pages/DashboardPage";
import { GamificationPage } from "../src/pages/GamificationPage";
import { AgendaAdminPage } from "../src/pages/AgendaAdminPage";
import { MyClassesPage } from "../src/pages/MyClassesPage";
import { MyPlanSection } from "../src/pages/plans/MyPlanSection";
import { UsersPage } from "../src/pages/UsersPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function LoggedIn({ children }: { children: React.ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  return ready ? <>{children}</> : null;
}

function renderScreen(page: ReactElement) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider>
        <MemoryRouter>
          <LoggedIn>{page}</LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

interface Screen {
  name: string;
  page: ReactElement;
  url: string;
  errorMessage: string;
  /** Resposta de sucesso sem nenhum item, para o estado vazio. */
  empty: object | null;
  emptyMessage: string;
}

const SCREENS: Screen[] = [
  {
    name: "Clientes",
    page: <ClientsPage />,
    url: "/api/clients",
    errorMessage: "Não foi possível carregar os clientes.",
    empty: [],
    emptyMessage: "Nenhum cliente encontrado.",
  },
  {
    name: "Usuários",
    page: <UsersPage />,
    url: "/api/users",
    errorMessage: "Não foi possível carregar os usuários.",
    empty: [],
    emptyMessage: "Nenhum usuário encontrado.",
  },
  {
    name: "Minhas aulas",
    page: <MyClassesPage />,
    url: "/api/attendance/classes",
    errorMessage: "Não foi possível carregar as aulas.",
    empty: [],
    emptyMessage: "Nenhuma aula hoje.",
  },
  {
    name: "Agenda administrativa",
    page: <AgendaAdminPage />,
    url: "/api/occurrences",
    errorMessage: "Não foi possível carregar a agenda.",
    empty: [],
    emptyMessage: "",
  },
  {
    name: "Agenda do cliente",
    page: <ClientAgendaPage />,
    url: "/api/agenda",
    errorMessage: "Não foi possível carregar a agenda.",
    empty: [],
    emptyMessage: "",
  },
  {
    name: "Plano",
    page: <MyPlanSection />,
    url: "/api/plans/mine",
    errorMessage: "Não foi possível carregar o seu plano.",
    empty: { active: null, history: [] },
    emptyMessage: "",
  },
  {
    name: "Ficha de treino",
    page: <ClientWorkoutSheetsPage />,
    url: "/api/workout-sheets/mine",
    errorMessage: "Não foi possível carregar as suas fichas.",
    empty: [],
    emptyMessage:
      "Você ainda não tem fichas de treino. Fale com o seu professor para receber a sua.",
  },
  {
    name: "Dashboard",
    page: <DashboardPage />,
    url: "/api/dashboard",
    errorMessage: "Não foi possível carregar o dashboard.",
    empty: null,
    emptyMessage: "",
  },
  {
    name: "FitPoints",
    page: <GamificationPage />,
    url: "/api/gamification/me",
    errorMessage: "Não foi possível carregar seus FitPoints.",
    empty: null,
    emptyMessage: "",
  },
];

describe("estados compartilhados nas telas principais", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
  });

  describe.each(SCREENS)("$name", ({ page, url, errorMessage, empty, emptyMessage }) => {
    it("mostra o estado de carregando enquanto espera a API", async () => {
      server.use(http.get(url, () => new Promise(() => {})));
      renderScreen(page);

      const loading = await screen.findByText("Carregando…");
      expect(loading).toHaveAttribute("role", "status");
    });

    it("mostra o erro como alerta e permite tentar de novo", async () => {
      let requests = 0;
      server.use(
        http.get(url, () => {
          requests += 1;
          return HttpResponse.json({ code: "ERRO", message: "falhou" }, { status: 500 });
        }),
      );
      renderScreen(page);
      const user = userEvent.setup();

      const alert = await screen.findByText(errorMessage);
      expect(alert.closest("[role=alert]")).not.toBeNull();
      const before = requests;

      await user.click(
        within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", {
          name: "Tentar novamente",
        }),
      );

      await waitFor(() => expect(requests).toBeGreaterThan(before));
    });

    if (emptyMessage) {
      it("mostra o estado vazio pelo componente compartilhado", async () => {
        server.use(http.get(url, () => HttpResponse.json(empty)));
        renderScreen(page);

        const message = await screen.findByText(emptyMessage);
        expect(message.closest("[data-state=empty]")).not.toBeNull();
      });
    }
  });
});
