import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  ErrorCode,
  Module,
  PermissionAction,
  PermissionScope,
  addDays,
  gymDateTimeToUtc,
  gymToday,
  startOfWeek,
  type AttendanceRoster,
  type EffectivePermission,
  type OccurrenceDetail,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AgendaAdminPage } from "../src/pages/AgendaAdminPage";
import { AttendancePage } from "../src/pages/AttendancePage";
import { ClassStudentSheetPage } from "../src/pages/ClassStudentSheetPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

/** O mesmo id que mockSuccessfulLogin dá a quem entra. */
const ME = { id: "user-1", fullName: "Rafael Andrade" };
const OTHER = { id: "user-camila", fullName: "Camila Rocha" };
const WEDNESDAY = addDays(startOfWeek(gymToday()), 2);

const PROFESSOR_PERMISSIONS: EffectivePermission[] = [
  {
    module: Module.OCORRENCIAS,
    actions: [PermissionAction.VIEW],
    scope: PermissionScope.ASSIGNED_CLASSES,
  },
  {
    module: Module.PRESENCA,
    actions: [PermissionAction.VIEW, PermissionAction.EXECUTE],
    scope: PermissionScope.ASSIGNED_CLASSES,
  },
  {
    module: Module.FICHAS_DE_TREINO,
    actions: [PermissionAction.VIEW, PermissionAction.EDIT],
    scope: PermissionScope.ASSIGNED_CLIENTS,
  },
];

const ADMIN_PERMISSIONS: EffectivePermission[] = ALL_MODULES.map((module) => ({
  module,
  actions: ALL_PERMISSION_ACTIONS,
  scope: PermissionScope.ALL,
}));

function occurrence(
  id: string,
  instructor: { id: string; fullName: string },
  overrides: Partial<OccurrenceDetail> = {},
): OccurrenceDetail {
  const startsAt = gymDateTimeToUtc(WEDNESDAY, "18:00");
  return {
    id,
    templateId: "tpl",
    seriesId: null,
    name: "Personal Class",
    description: null,
    modality: { id: "mod", name: "Personal Class" },
    instructor,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    capacity: 3,
    bookedCount: 1,
    status: "SCHEDULED",
    ...overrides,
  };
}

const ROSTER: AttendanceRoster = {
  class: {
    id: "occ-own",
    name: "Personal Class",
    modality: { id: "mod", name: "Personal Class" },
    instructor: ME,
    startsAt: gymDateTimeToUtc(WEDNESDAY, "18:00").toISOString(),
    endsAt: gymDateTimeToUtc(WEDNESDAY, "19:00").toISOString(),
    durationMinutes: 60,
    totalCount: 1,
    registeredCount: 0,
  },
  entries: [
    {
      reservationId: "r-marina",
      client: { id: "c-marina", fullName: "Marina Costa" },
      status: "PENDING",
    },
  ],
};

function sheet(id: string, overrides: Partial<WorkoutSheet> = {}): WorkoutSheet {
  return {
    id,
    clientId: "c-marina",
    title: "Treino A — Inferiores",
    notes: null,
    status: "ACTIVE",
    authorName: "Rafael Andrade",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    exercises: [
      {
        id: `${id}-e1`,
        name: "Agachamento livre",
        sets: "4",
        reps: "12",
        load: "30kg",
        duration: null,
        distance: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="rota">{pathname + search}</output>;
}

function LoggedIn({ children }: { children: React.ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    login("usuario@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  return ready ? <>{children}</> : null;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn>
            <Where />
            <Routes>
              <Route path="/agenda-administrativa" element={<AgendaAdminPage />} />
              <Route path="/presenca/:occurrenceId" element={<AttendancePage />} />
              <Route
                path="/presenca/:occurrenceId/alunos/:clientId"
                element={<ClassStudentSheetPage />}
              />
              <Route path="/minhas-aulas" element={<h1>Minhas aulas (tela)</h1>} />
              <Route path="/fichas" element={<h1>Fichas (tela)</h1>} />
            </Routes>
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function mockApi(options: { occurrences?: OccurrenceDetail[]; sheets?: WorkoutSheet[] } = {}) {
  server.use(
    http.get("/api/occurrences", () => HttpResponse.json(options.occurrences ?? [])),
    http.get("/api/occurrences/options", () =>
      HttpResponse.json({ templates: [], instructors: [ME, OTHER] }),
    ),
    http.get("/api/attendance/classes/:id", () => HttpResponse.json(ROSTER)),
    http.get("/api/workout-sheets", () => HttpResponse.json(options.sheets ?? [sheet("s-1")])),
  );
}

describe("Professor: Agenda → alunos da aula → ficha de treino", () => {
  describe("Agenda", () => {
    it("o professor que clica na própria aula vai direto à lista de alunos", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi({ occurrences: [occurrence("occ-own", ME)] });
      renderAt("/agenda-administrativa");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Personal Class/ }));

      expect(await screen.findByRole("heading", { name: "Presença" })).toBeInTheDocument();
      expect(screen.getByLabelText("rota")).toHaveTextContent("/presenca/occ-own");
      expect(await screen.findByText("Marina Costa")).toBeInTheDocument();
    });

    it("o voltar da Presença devolve à Agenda quando a pessoa veio dela", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi({ occurrences: [occurrence("occ-own", ME)] });
      renderAt("/agenda-administrativa");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Personal Class/ }));
      await user.click(await screen.findByRole("button", { name: "Voltar" }));

      expect(
        await screen.findByRole("heading", { name: /agenda administrativa/i }),
      ).toBeInTheDocument();
    });

    it("na aula de outro professor, quem vê todas abre o modal e chega aos alunos por 'Ver alunos'", async () => {
      mockSuccessfulLogin("Administrador", ADMIN_PERMISSIONS);
      mockApi({ occurrences: [occurrence("occ-other", OTHER)] });
      renderAt("/agenda-administrativa");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Personal Class/ }));
      const dialog = await screen.findByRole("dialog", { name: "Editar aula" });
      await user.click(within(dialog).getByRole("button", { name: "Ver alunos" }));

      expect(await screen.findByRole("heading", { name: "Presença" })).toBeInTheDocument();
      expect(screen.getByLabelText("rota")).toHaveTextContent("/presenca/occ-other");
    });

    it("sem permissão de presença, o clique abre o modal e não oferece 'Ver alunos'", async () => {
      mockSuccessfulLogin("Professor", [
        {
          module: Module.OCORRENCIAS,
          actions: [PermissionAction.VIEW, PermissionAction.EDIT],
          scope: PermissionScope.ALL,
        },
      ]);
      mockApi({ occurrences: [occurrence("occ-own", ME)] });
      renderAt("/agenda-administrativa");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Personal Class/ }));

      const dialog = await screen.findByRole("dialog", { name: "Editar aula" });
      expect(within(dialog).queryByRole("button", { name: "Ver alunos" })).not.toBeInTheDocument();
    });

    it("aula cancelada abre o modal sem 'Ver alunos'", async () => {
      mockSuccessfulLogin("Administrador", ADMIN_PERMISSIONS);
      mockApi({ occurrences: [occurrence("occ-own", ME, { status: "CANCELLED" })] });
      renderAt("/agenda-administrativa");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Personal Class/ }));

      const dialog = await screen.findByRole("dialog", { name: "Editar aula" });
      expect(within(dialog).queryByRole("button", { name: "Ver alunos" })).not.toBeInTheDocument();
    });
  });

  describe("Lista de alunos (Presença)", () => {
    it("o nome do aluno abre a ficha dele quando a pessoa pode ver fichas", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi();
      renderAt("/presenca/occ-own");
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole("link", { name: "Ficha de treino de Marina Costa" }),
      );

      expect(screen.getByLabelText("rota")).toHaveTextContent("/presenca/occ-own/alunos/c-marina");
      expect(await screen.findByText("Agachamento livre")).toBeInTheDocument();
    });

    it("sem permissão de fichas, o nome é só texto", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS.slice(0, 2));
      mockApi();
      renderAt("/presenca/occ-own");

      expect(await screen.findByText("Marina Costa")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Ficha de treino de/ })).not.toBeInTheDocument();
    });

    it("sem origem conhecida, o voltar vai para Minhas aulas", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi();
      renderAt("/presenca/occ-own");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Voltar" }));

      expect(
        await screen.findByRole("heading", { name: "Minhas aulas (tela)" }),
      ).toBeInTheDocument();
    });
  });

  describe("Ficha do aluno", () => {
    const PATH = "/presenca/occ-own/alunos/c-marina";

    it("mostra o aluno, a aula e os exercícios da ficha ativa", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi();
      renderAt(PATH);

      expect(await screen.findByRole("heading", { name: "Marina Costa" })).toBeInTheDocument();
      expect(screen.getByText(/Personal Class,/)).toBeInTheDocument();
      expect(await screen.findByText("Treino A — Inferiores")).toBeInTheDocument();
      expect(screen.getByText("Agachamento livre")).toBeInTheDocument();
      expect(screen.getByText("30kg")).toBeInTheDocument();
    });

    it("lista as fichas anteriores e abre uma delas; 'Ficha ativa' volta para a atual", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi({
        sheets: [
          sheet("s-active"),
          sheet("s-old", { title: "Fase 1 — Adaptação", status: "COMPLETED" }),
        ],
      });
      renderAt(PATH);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("link", { name: /Fase 1 — Adaptação/ }));
      expect(
        await screen.findByRole("heading", { name: "Fase 1 — Adaptação" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Treino A — Inferiores")).not.toBeInTheDocument();

      await user.click(screen.getByRole("link", { name: /Ficha ativa/ }));
      expect(await screen.findByText("Treino A — Inferiores")).toBeInTheDocument();
    });

    it("aluno sem ficha mostra o estado vazio", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi({ sheets: [] });
      renderAt(PATH);

      expect(
        await screen.findByText("Este aluno ainda não tem ficha de treino."),
      ).toBeInTheDocument();
    });

    it("aluno fora do escopo mostra a explicação", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi();
      server.use(
        http.get("/api/workout-sheets", () =>
          HttpResponse.json(
            { code: ErrorCode.OUT_OF_SCOPE, message: "Este cliente está fora do seu escopo." },
            { status: 403 },
          ),
        ),
      );
      renderAt(PATH);

      expect(await screen.findByText("Este aluno está fora do seu escopo.")).toBeInTheDocument();
    });

    it("'Editar ficha' leva às Fichas com o aluno escolhido, só para quem pode editar", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi();
      renderAt(PATH);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("link", { name: "Editar ficha" }));

      await waitFor(() =>
        expect(screen.getByLabelText("rota")).toHaveTextContent("/fichas?cliente=c-marina"),
      );
    });

    it("sem permissão de edição, não há 'Editar ficha'", async () => {
      mockSuccessfulLogin("Professor", [
        PROFESSOR_PERMISSIONS[1],
        {
          module: Module.FICHAS_DE_TREINO,
          actions: [PermissionAction.VIEW],
          scope: PermissionScope.ASSIGNED_CLIENTS,
        },
      ]);
      mockApi();
      renderAt(PATH);

      expect(await screen.findByText("Agachamento livre")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Editar ficha" })).not.toBeInTheDocument();
    });

    it("o voltar da ficha retorna à lista de alunos da aula", async () => {
      mockSuccessfulLogin("Professor", PROFESSOR_PERMISSIONS);
      mockApi();
      renderAt(PATH);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Voltar" }));

      expect(await screen.findByRole("heading", { name: "Presença" })).toBeInTheDocument();
      expect(screen.getByLabelText("rota")).toHaveTextContent("/presenca/occ-own");
    });
  });
});
