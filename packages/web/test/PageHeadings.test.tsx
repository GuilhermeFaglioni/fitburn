import { useEffect, useState, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { GoalsPage } from "../src/pages/GoalsPage";
import { WorkoutSheetsPage } from "../src/pages/WorkoutSheetsPage";
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

const STUDENTS = [{ id: "c-1", fullName: "Marina Souza", email: "marina@email.com" }];

describe("toda tela tem um título de nível 1, também antes de escolher um aluno", () => {
  beforeEach(() => mockSuccessfulLogin("Administrador"));

  it("Metas individuais", async () => {
    server.use(http.get("/api/goals/clients", () => HttpResponse.json(STUDENTS)));
    renderScreen(<GoalsPage />);

    await screen.findByText("Selecione um aluno para ver e criar metas.");

    expect(
      screen.getByRole("heading", { level: 1, name: "Metas individuais" }),
    ).toBeInTheDocument();
  });

  it("Fichas de treino", async () => {
    server.use(http.get("/api/workout-sheets/clients", () => HttpResponse.json(STUDENTS)));
    renderScreen(<WorkoutSheetsPage />);

    await screen.findByText("Selecione um aluno para ver e montar fichas.");

    expect(screen.getByRole("heading", { level: 1, name: "Fichas de treino" })).toBeInTheDocument();
  });
});
