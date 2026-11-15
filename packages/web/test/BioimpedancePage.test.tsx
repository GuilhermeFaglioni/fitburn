import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { CurrentUser } from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { tokenStore } from "../src/lib/auth/token-store";
import { server } from "./msw-server";

const CLIENT: CurrentUser = {
  id: "user-1",
  email: "marina.souza@email.com",
  fullName: "Marina Souza",
  status: "ACTIVE",
  profile: { id: "profile-1", name: "Cliente" },
  permissions: [],
  onboardingPending: [],
};

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

describe("Bioimpedância: autorização (/bioimpedancia, D-042)", () => {
  let consented: boolean;
  let changes: boolean[];
  let failNext: boolean;

  const consentBody = () => ({
    consented,
    currentVersion: "1",
    manifestation: changes.length
      ? {
          id: `bio-${changes.length}`,
          userId: CLIENT.id,
          type: "CONSENT_BIOIMPEDANCE",
          version: "1",
          action: consented ? "GRANTED" : "REVOKED",
          createdAt: "2026-11-15T00:00:00.000Z",
        }
      : null,
  });

  beforeEach(() => {
    tokenStore.set(null);
    consented = false;
    changes = [];
    failNext = false;
    server.use(
      http.post("/api/auth/refresh", () =>
        HttpResponse.json({ accessToken: "token", user: CLIENT }),
      ),
      http.get("/api/bioimpedance/assessments/mine", () => HttpResponse.json([])),
      http.get("/api/bioimpedance/consent", () => HttpResponse.json(consentBody())),
      http.patch("/api/bioimpedance/consent", async ({ request }) => {
        if (failNext) {
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Falha ao registrar." },
            { status: 500 },
          );
        }
        const body = (await request.json()) as { consented: boolean };
        consented = body.consented;
        changes.push(body.consented);
        return HttpResponse.json(consentBody());
      }),
    );
  });

  it("sem consentimento mostra a autorização com 'Autorizar registro' e 'Agora não'", async () => {
    renderAt("/bioimpedancia");

    expect(await screen.findByRole("heading", { name: "Acompanhe sua evolução" })).toBeVisible();
    expect(screen.getByText("Guardamos só os valores, não a imagem do laudo.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ler a política de privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(screen.getByRole("button", { name: "Autorizar registro" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeEnabled();
  });

  it("'Autorizar registro' grava o consentimento e troca para o estado autorizado", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia");

    await user.click(await screen.findByRole("button", { name: "Autorizar registro" }));

    expect(await screen.findByText(/Você ainda não tem avaliações registradas/)).toBeVisible();
    expect(changes).toEqual([true]);
    expect(screen.queryByRole("button", { name: "Autorizar registro" })).not.toBeInTheDocument();
  });

  it("'Agora não' volta ao Início sem gravar nada", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia");

    await user.click(await screen.findByRole("button", { name: "Agora não" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
    expect(changes).toEqual([]);
  });

  it("já autorizado não pede autorização de novo", async () => {
    consented = true;
    renderAt("/bioimpedancia");

    expect(await screen.findByText(/Você ainda não tem avaliações registradas/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Autorizar registro" })).not.toBeInTheDocument();
  });

  it("mostra o erro e mantém a autorização quando o registro falha", async () => {
    const user = userEvent.setup();
    failNext = true;
    renderAt("/bioimpedancia");

    await user.click(await screen.findByRole("button", { name: "Autorizar registro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao registrar.");
    expect(screen.getByRole("button", { name: "Autorizar registro" })).toBeEnabled();
    expect(changes).toEqual([]);
  });
});
