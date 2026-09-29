import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  Module,
  PermissionAction,
  PermissionScope,
  type EffectivePermission,
} from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { server } from "./msw-server";

const ADMIN_PERMISSIONS: EffectivePermission[] = ALL_MODULES.map((module) => ({
  module,
  actions: ALL_PERMISSION_ACTIONS,
  scope: PermissionScope.ALL,
}));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function mockSession(profileName: string, permissions: EffectivePermission[]) {
  server.use(
    http.post("/api/auth/refresh", () =>
      HttpResponse.json({
        accessToken: "token",
        user: {
          id: "user-1",
          email: "usuario@fitburn.local",
          fullName: "Usuário de Teste",
          status: "ACTIVE",
          profile: { id: "profile-1", name: profileName },
          permissions,
        },
      }),
    ),
    http.get("/api/occurrences", () => HttpResponse.json([])),
    http.get("/api/occurrences/options", () =>
      HttpResponse.json({ templates: [], instructors: [] }),
    ),
    http.get("/api/agenda", () => HttpResponse.json([])),
    http.get("/api/workout-sheets/mine", () => HttpResponse.json([])),
    http.get("/api/workout-sheets/clients", () => HttpResponse.json([])),
    http.get("/api/attendance/classes", () => HttpResponse.json([])),
    http.get("/api/attendance/classes/:occurrenceId", () =>
      HttpResponse.json({
        class: {
          id: "occ-1",
          name: "Treino Funcional",
          modality: { id: "mod-1", name: "Treino Funcional" },
          instructor: null,
          startsAt: "2026-05-04T21:00:00.000Z",
          endsAt: "2026-05-04T22:00:00.000Z",
          durationMinutes: 60,
          totalCount: 0,
          registeredCount: 0,
        },
        entries: [],
      }),
    ),
  );
}

async function expectLocation(path: string) {
  expect(await screen.findByTestId("location")).toBeInTheDocument();
  await screen.findByText(path, { selector: "[data-testid=location]" });
}

describe("Área de cada perfil", () => {
  it("a equipe que abre a agenda do cliente vai para a agenda administrativa", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);

    renderAt("/agenda");

    await expectLocation("/agenda-administrativa");
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "href",
      "/agenda-administrativa",
    );
    expect(screen.queryByRole("region", { name: "Aulas do dia" })).not.toBeInTheDocument();
  });

  it("a equipe que cai na Home do cliente vai para o dashboard", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);

    renderAt("/");

    await expectLocation("/dashboard");
  });

  it("perfil de equipe sem dashboard vai para a primeira tela administrativa que pode ver", async () => {
    mockSession("Professor", [
      {
        module: Module.OCORRENCIAS,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLASSES,
      },
    ]);

    renderAt("/");

    await expectLocation("/agenda-administrativa");
  });

  it("a equipe não abre pela URL uma tela do menu que o perfil não pode usar", async () => {
    mockSession("Professor", [
      {
        module: Module.PRESENCA,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLASSES,
      },
    ]);

    // Por exemplo, a rota preservada no login de outra pessoa.
    renderAt("/atribuicoes");

    await expectLocation("/minhas-aulas");
  });

  it("quem pode usar a tela continua nela", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);

    renderAt("/atribuicoes");

    await expectLocation("/atribuicoes");
  });

  it("o professor que só registra presença vai para Minhas aulas", async () => {
    mockSession("Professor", [
      {
        module: Module.PRESENCA,
        actions: [PermissionAction.VIEW, PermissionAction.EXECUTE],
        scope: PermissionScope.ASSIGNED_CLASSES,
      },
    ]);

    renderAt("/");

    await expectLocation("/minhas-aulas");
    expect(screen.getByRole("link", { name: "Minhas aulas" })).toHaveAttribute(
      "href",
      "/minhas-aulas",
    );
  });

  it("a tela de presença é da equipe: o cliente que a abre volta para a Home", async () => {
    mockSession("Cliente", []);

    renderAt("/presenca/occ-1");

    await expectLocation("/");
  });

  it("o cliente não entra na área administrativa", async () => {
    mockSession("Cliente", []);

    renderAt("/agenda-administrativa");

    await expectLocation("/");
  });

  it("o cliente continua na própria agenda", async () => {
    mockSession("Cliente", []);

    renderAt("/agenda");

    await expectLocation("/agenda");
    expect(await screen.findByRole("region", { name: "Aulas do dia" })).toBeInTheDocument();
  });
  it("o cliente abre a ficha de treino pelo item Treino da navegação", async () => {
    mockSession("Cliente", []);

    renderAt("/ficha-treino");

    await expectLocation("/ficha-treino");
    expect(await screen.findByRole("heading", { name: "Ficha de treino" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Treino" })[0]).toHaveAttribute(
      "href",
      "/ficha-treino",
    );
  });

  it("o cliente não abre o editor de fichas da equipe", async () => {
    mockSession("Cliente", []);

    renderAt("/fichas");

    await expectLocation("/");
  });

  it("o professor com acesso às fichas abre o editor e vê o item Fichas de treino no menu", async () => {
    mockSession("Professor", [
      {
        module: Module.FICHAS_DE_TREINO,
        actions: [PermissionAction.VIEW, PermissionAction.CREATE],
        scope: PermissionScope.ASSIGNED_CLIENTS,
      },
    ]);

    renderAt("/fichas");

    await expectLocation("/fichas");
    expect(await screen.findByRole("link", { name: "Fichas de treino" })).toHaveAttribute(
      "href",
      "/fichas",
    );
  });

  it("a equipe sem o módulo de fichas não abre o editor pela URL", async () => {
    mockSession("Professor", [
      {
        module: Module.PRESENCA,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ASSIGNED_CLASSES,
      },
    ]);

    renderAt("/fichas");

    await expectLocation("/minhas-aulas");
  });

  it("a equipe que abre a ficha do cliente vai para o editor de fichas", async () => {
    mockSession("Administrador", ADMIN_PERMISSIONS);

    renderAt("/ficha-treino");

    await expectLocation("/fichas");
  });
});
