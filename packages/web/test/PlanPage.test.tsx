import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { MyPlan, PlanAssignment } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { PlanPage } from "../src/pages/PlanPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function assignment(
  id: string,
  name: string,
  startDate: string,
  endDate: string,
  status: PlanAssignment["status"],
  description: string | null = null,
): PlanAssignment {
  return { id, plan: { id: `plan-${id}`, name, description }, startDate, endDate, status };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("marina@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <PlanPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/plano"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Plano do cliente", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  function mockPlan(plan: MyPlan) {
    server.use(http.get("/api/plans/mine", () => HttpResponse.json(plan)));
  }

  it("mostra o plano ativo, com a descrição e as datas de início e término", async () => {
    mockPlan({
      active: assignment(
        "1",
        "Plano Performance",
        "2026-08-15",
        "2026-11-15",
        "ACTIVE",
        "Acesso ilimitado a todas as modalidades.",
      ),
      history: [],
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Plano" })).toBeInTheDocument();
    const card = await screen.findByRole("region", { name: "Plano ativo" });
    expect(within(card).getByText("Plano Performance")).toBeInTheDocument();
    expect(within(card).getByText("ATIVO")).toBeInTheDocument();
    expect(within(card).getByText("Acesso ilimitado a todas as modalidades.")).toBeInTheDocument();
    expect(within(card).getByText("Início")).toBeInTheDocument();
    expect(within(card).getByText("15/08/2026")).toBeInTheDocument();
    expect(within(card).getByText("Término")).toBeInTheDocument();
    expect(within(card).getByText("15/11/2026")).toBeInTheDocument();
  });

  it("lista o histórico de planos, do mais recente ao mais antigo, como encerrados", async () => {
    mockPlan({
      active: assignment("1", "Plano Performance", "2026-08-15", "2026-11-15", "ACTIVE"),
      history: [
        assignment("2", "Plano Essencial", "2026-02-15", "2026-08-14", "ENDED"),
        assignment("3", "Plano Experimental (7 dias)", "2026-02-01", "2026-02-07", "ENDED"),
      ],
    });

    renderPage();

    const history = await screen.findByRole("region", { name: "Histórico de planos" });
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Plano Essencial")).toBeInTheDocument();
    expect(within(items[0]).getByText("15/02/2026 – 14/08/2026")).toBeInTheDocument();
    expect(within(items[0]).getByText("ENCERRADO")).toBeInTheDocument();
    expect(within(items[1]).getByText("Plano Experimental (7 dias)")).toBeInTheDocument();
  });

  it("sem plano ativo mostra o estado vazio, sem nenhuma oferta comercial", async () => {
    mockPlan({
      active: null,
      history: [assignment("2", "Plano Essencial", "2026-02-15", "2026-08-14", "ENDED")],
    });

    renderPage();

    expect(
      await screen.findByText(
        "Você não tem um plano ativo no momento. Fale com a recepção do Fitburn para contratar um plano.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Plano ativo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("sem nenhum plano no histórico, a seção de histórico traz o estado vazio", async () => {
    mockPlan({ active: null, history: [] });

    renderPage();

    expect(await screen.findByText("Nenhum plano anterior.")).toBeInTheDocument();
  });

  it("avisa quando o plano não carrega", async () => {
    server.use(
      http.get("/api/plans/mine", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro inesperado." }, { status: 500 }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o seu plano.",
    );
  });
});
