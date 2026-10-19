import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { server } from "./msw-server";

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderFlow() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/agenda"]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Onboarding obrigatório", () => {
  beforeEach(() => {
    const pendingUser = {
      id: "user-1",
      email: "marina@fitburn.local",
      fullName: "Marina Souza",
      status: "ACTIVE",
      profile: { id: "profile-client", name: "Cliente" },
      permissions: [],
      onboardingPending: ["PASSWORD_CHANGE"],
    };
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ accessToken: "token-temporario", user: pendingUser }, { status: 201 }),
      ),
      http.post("/api/auth/password", () =>
        HttpResponse.json({
          accessToken: "token-atualizado",
          user: { ...pendingUser, onboardingPending: [] },
        }),
      ),
      http.get("/api/plans/mine", () => HttpResponse.json({ active: null, history: [] })),
      http.get("/api/reservations", () => HttpResponse.json([])),
      http.get("/api/gamification/me", () =>
        HttpResponse.json({
          totalPoints: 0,
          history: [],
          streak: { current: 0, best: 0 },
          badges: [],
        }),
      ),
    );
  });

  it("redireciona para a troca obrigatória, bloqueia a agenda e libera o app após salvar", async () => {
    renderFlow();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByRole("heading", { name: "Troca obrigatória de senha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("/onboarding", { selector: "[data-testid=location]" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Agenda", { selector: "h1" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Senha atual"), "SenhaTemporaria123!");
    await user.type(screen.getByLabelText("Nova senha"), "SenhaDefinitiva456!");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(
      await screen.findByText("/", { selector: "[data-testid=location]" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Troca obrigatória de senha" }),
    ).not.toBeInTheDocument();
  });
});
