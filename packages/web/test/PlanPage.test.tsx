import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { MyPlan, PlanAssignment } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { MyPlanSection } from "../src/pages/plans/MyPlanSection";
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
  return <MyPlanSection />;
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

describe("Plano do cliente (seção do Perfil)", () => {
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

    expect(await screen.findByRole("heading", { name: "Meu plano" })).toBeInTheDocument();
    const card = await screen.findByRole("region", { name: "Plano ativo" });
    expect(within(card).getByText("Plano Performance")).toBeInTheDocument();
    expect(within(card).getByText("ATIVO")).toBeInTheDocument();
    expect(within(card).getByText("Acesso ilimitado a todas as modalidades.")).toBeInTheDocument();
    expect(within(card).getByText("Início")).toBeInTheDocument();
    expect(within(card).getByText("15/08/2026")).toBeInTheDocument();
    expect(within(card).getByText("Término")).toBeInTheDocument();
    expect(within(card).getByText("15/11/2026")).toBeInTheDocument();
  });

  it("com início futuro mostra 'Começa em dd/mm' e as datas, sem o selo de ativo", async () => {
    mockPlan({
      active: assignment("1", "Plano Performance", "2099-01-10", "2099-06-10", "ACTIVE"),
      history: [],
    });

    renderPage();

    const card = await screen.findByRole("region", { name: "Plano ativo" });
    expect(within(card).getByText("Começa em 10/01")).toBeInTheDocument();
    expect(within(card).queryByText("ATIVO")).not.toBeInTheDocument();
    expect(within(card).getByText("10/01/2099")).toBeInTheDocument();
    expect(within(card).getByText("10/06/2099")).toBeInTheDocument();
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

  it("o selo de situação é o Badge compartilhado: ATIVO em tom de sucesso, 'Começa em' em tom de marca", async () => {
    mockPlan({
      active: assignment("1", "Plano Performance", "2026-08-15", "2026-11-15", "ACTIVE"),
      history: [],
    });
    const first = renderPage();

    const active = await screen.findByRole("region", { name: "Plano ativo" });
    expect(within(active).getByText("ATIVO")).toHaveClass("fb-ui-badge", "fb-ui-badge--ok");
    first.unmount();

    mockPlan({
      active: assignment("1", "Plano Performance", "2099-01-10", "2099-06-10", "ACTIVE"),
      history: [],
    });
    renderPage();
    const future = await screen.findByRole("region", { name: "Plano ativo" });
    expect(within(future).getByText("Começa em 10/01")).toHaveClass(
      "fb-ui-badge",
      "fb-ui-badge--brand",
    );
  });

  it("o plano ativo é um Card em destaque e a validade são os dois pares início/término", async () => {
    mockPlan({
      active: assignment("1", "Plano Performance", "2026-08-15", "2026-11-15", "ACTIVE"),
      history: [],
    });

    renderPage();

    const card = await screen.findByRole("region", { name: "Plano ativo" });
    expect(card).toHaveClass("fb-ui-card", "fb-ui-card--selected");
    expect(within(card).getByText("Início").nextElementSibling).toHaveTextContent("15/08/2026");
    expect(within(card).getByText("Término").nextElementSibling).toHaveTextContent("15/11/2026");
  });

  it("os títulos seguem a ordem: 'Meu plano' em h2 e 'Histórico de planos' em h3", async () => {
    mockPlan({ active: null, history: [] });

    renderPage();

    await screen.findByText("Nenhum plano anterior.");
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => [Number(heading.tagName[1]), heading.textContent]);
    expect(headings).toEqual([
      [2, "Meu plano"],
      [3, "Histórico de planos"],
    ]);
  });

  describe("estados", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it("mostra o carregando, com o título da seção, enquanto o plano não chega", async () => {
      server.use(http.get("/api/plans/mine", () => new Promise(() => {})));

      renderPage();

      const loading = await screen.findByText("Carregando…");
      expect(loading.closest("[data-state=loading]")).toHaveAttribute("role", "status");
      expect(screen.getByRole("heading", { name: "Meu plano" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Histórico de planos" })).toBeNull();
    });

    it("o erro tem a ação de tentar de novo, que pede o plano outra vez", async () => {
      let requests = 0;
      server.use(
        http.get("/api/plans/mine", () => {
          requests += 1;
          return HttpResponse.json({ code: "INTERNAL_ERROR", message: "x" }, { status: 500 });
        }),
      );
      const user = userEvent.setup();

      renderPage();

      const alert = await screen.findByRole("alert");
      const before = requests;
      await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
      await waitFor(() => expect(requests).toBeGreaterThan(before));
    });

    it("sem conexão mostra o estado offline, não o erro", async () => {
      onlineManager.setOnline(false);

      renderPage();

      const offline = await waitFor(() => {
        const node = document.querySelector('[data-state="offline"]');
        expect(node).not.toBeNull();
        return node as HTMLElement;
      });
      expect(offline).toHaveTextContent("Sem conexão");
      expect(offline).toHaveTextContent("Não foi possível carregar o seu plano.");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
