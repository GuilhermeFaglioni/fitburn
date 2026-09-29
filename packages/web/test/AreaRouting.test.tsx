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
});
