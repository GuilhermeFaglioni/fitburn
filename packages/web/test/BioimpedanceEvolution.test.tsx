import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  BIOIMPEDANCE_MEASURES,
  type BioimpedanceAssessment,
  type CurrentUser,
  type MeasureValue,
} from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { tokenStore } from "../src/lib/auth/token-store";
import { server } from "./msw-server";
import { setBrowserOnline } from "./connectivity-helpers";

const CLIENT: CurrentUser = {
  id: "user-1",
  email: "cliente.exemplo@email.com",
  fullName: "Cliente Exemplo",
  status: "ACTIVE",
  profile: { id: "profile-1", name: "Cliente" },
  permissions: [],
  onboardingPending: [],
};

function assessment(
  id: string,
  measuredAt: string,
  weight: number,
  extra: Record<string, MeasureValue> = {},
): BioimpedanceAssessment {
  return {
    id,
    clientId: CLIENT.id,
    clientName: CLIENT.fullName,
    measuredAt,
    heightCm: 170,
    age: 30,
    source: "MANUAL",
    authorName: "Prof. Exemplo",
    schemaVersion: 1,
    createdAt: measuredAt,
    updatedAt: measuredAt,
    measures: {
      weight: { value: weight, rangeMin: 56, rangeMax: 75.7, rating: "NORMAL" },
      bodyFatPercent: { value: 19.2 },
      ...extra,
    },
  };
}

const TRUNK_NEW = { value: 25.2, percent: 100.4, rating: "NORMAL" } as const;
const OLD_YEAR = assessment("a-0", "2025-03-10T12:00:00.000Z", 72.8);
const A_1 = assessment("a-1", "2025-12-12T12:00:00.000Z", 70.5);
const A_2 = assessment("a-2", "2026-03-16T12:00:00.000Z", 70.9, { leanTrunk: { value: 25.1, percent: 99.6, rating: "NORMAL" } });
const A_3 = assessment("a-3", "2026-07-03T19:00:00.000Z", 69.8, {
  leanTrunk: { value: 25.3, percent: 100.1, rating: "NORMAL" },
  leanLeftArm: { value: 3.05, percent: 101.2, rating: "NORMAL" },
  fatTrunk: { value: 7.1, percent: 166.9, rating: "ABOVE" },
});
const A_4 = assessment("a-4", "2026-11-11T09:11:00.000Z", 69.2, {
  leanTrunk: TRUNK_NEW,
  leanLeftArm: { value: 3.08, percent: 102.6, rating: "NORMAL" },
  leanLeftLeg: { value: 8.18, percent: 89.4, rating: "BELOW" },
  fatTrunk: { value: 7, percent: 166.2, rating: "ABOVE" },
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
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

describe("Composição corporal do cliente: Evolução e Segmentar (#198)", () => {
  let items: BioimpedanceAssessment[];
  let consented: boolean;
  let listFails: boolean;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T12:00:00.000Z") });
    setBrowserOnline(true);
    tokenStore.set(null);
    items = [OLD_YEAR, A_1, A_2, A_3, A_4];
    consented = true;
    listFails = false;
    server.use(
      http.post("/api/auth/refresh", () => HttpResponse.json({ accessToken: "token", user: CLIENT })),
      http.get("/api/bioimpedance/consent", () =>
        HttpResponse.json({ consented, currentVersion: "1", manifestation: null }),
      ),
      http.get("/api/bioimpedance/assessments/mine", () =>
        listFails
          ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Falha." }, { status: 500 })
          : HttpResponse.json(items),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    setBrowserOnline(true);
  });

  it("Evolução: gráfico do peso com faixa normal, primeira × atual e tabela por data (mais recente primeiro)", async () => {
    renderAt("/bioimpedancia?aba=evolucao");

    const chart = await screen.findByRole("img", { name: /Evolução de Peso: 5 pontos, de 72,8 kg a 69,2 kg/ });
    expect(chart).toBeVisible();
    expect(screen.getByText("Faixa normal: 56–75,7")).toBeVisible();
    expect(screen.getByText("Primeira (10/03/2025)")).toBeVisible();
    expect(screen.getByText("Atual (11/11/2026)")).toBeVisible();
    expect(screen.getByText("Atual (11/11/2026)").closest("div")).toHaveTextContent("caiu 3,6 kg");

    const table = screen.getByRole("table", { name: /Evolução de Peso: valores por data/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(6);
    expect(rows[1]).toHaveTextContent("11/11/2026");
    expect(rows[1]).toHaveTextContent("69,2 kg");
    expect(rows[5]).toHaveTextContent("10/03/2025");
  });

  it("o seletor de medida lista todas as medidas numéricas do catálogo e grava a escolha na URL", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia?aba=evolucao");

    const select = await screen.findByRole("combobox", { name: "Medida" });
    expect(within(select).getAllByRole("option")).toHaveLength(BIOIMPEDANCE_MEASURES.length);

    await user.selectOptions(select, "bodyFatPercent");

    expect(screen.getByTestId("location")).toHaveTextContent("medida=bodyFatPercent");
    expect(await screen.findByRole("img", { name: /Evolução de Gordura corporal \(PGC\)/ })).toBeVisible();
  });

  it("abre direto na medida e no período da URL", async () => {
    renderAt("/bioimpedancia?aba=evolucao&medida=weight&periodo=6m");

    expect(await screen.findByRole("img", { name: /Evolução de Peso: 2 pontos, de 69,8 kg a 69,2 kg/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "6 meses" })).toHaveAttribute("aria-pressed", "true");
  });

  it("o período filtra os pontos: 6 meses, 1 ano e tudo", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia?aba=evolucao");
    await screen.findByRole("img", { name: /5 pontos/ });

    await user.click(screen.getByRole("button", { name: "1 ano" }));
    expect(await screen.findByRole("img", { name: /4 pontos, de 70,5 kg a 69,2 kg/ })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("periodo=1y");

    await user.click(screen.getByRole("button", { name: "6 meses" }));
    expect(await screen.findByRole("img", { name: /2 pontos/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Tudo" }));
    expect(await screen.findByRole("img", { name: /5 pontos/ })).toBeVisible();
    expect(screen.getByTestId("location")).not.toHaveTextContent("periodo=");
  });

  it("medida desconhecida na URL volta para o peso", async () => {
    renderAt("/bioimpedancia?aba=evolucao&medida=nao-existe");

    expect(await screen.findByRole("combobox", { name: "Medida" })).toHaveValue("weight");
  });

  it("medida sem registro mostra o estado vazio", async () => {
    renderAt("/bioimpedancia?aba=evolucao&medida=inbodyScore");

    expect(await screen.findByText(/Pontuação InBody não tem registro nas suas avaliações/)).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("com um registro só, mostra o ponto e explica que a linha vem do segundo", async () => {
    items = [A_4];
    renderAt("/bioimpedancia?aba=evolucao");

    expect(await screen.findByRole("img", { name: /Evolução de Peso: 1 ponto/ })).toBeVisible();
    expect(screen.getByText(/A linha aparece a partir do segundo/)).toBeVisible();
    expect(screen.queryByText(/Primeira \(/)).not.toBeInTheDocument();
  });

  it("a linha só anima quando o usuário não pede movimento reduzido (regra em CSS)", async () => {
    const css = (await import("../src/styles/profile.css?raw")).default;
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*{\s*\.fb-linechart__line/);
  });

  it("Segmentar: massa magra com kg, % do ideal, avaliação e variação desde a anterior", async () => {
    renderAt("/bioimpedancia?aba=segmentar");

    const list = within(await screen.findByRole("list", { name: "Massa magra por região" }));
    const trunk = list.getByText("Tronco").closest("li") as HTMLElement;
    expect(trunk).toHaveTextContent("25,2 kg");
    expect(trunk).toHaveTextContent("100,4%");
    expect(trunk).toHaveTextContent("Normal");
    const leg = list.getByText("Perna esquerda").closest("li") as HTMLElement;
    expect(leg).toHaveTextContent("Abaixo");

    expect(screen.getByRole("heading", { name: "Desde 03/07/2026" })).toBeVisible();
    const since = within(screen.getByRole("heading", { name: "Desde 03/07/2026" }).closest("section") as HTMLElement);
    expect(since.getByText("Tronco").closest("div")).toHaveTextContent("caiu 0,1 kg");
    expect(since.getByText("Braço esquerdo").closest("div")).toHaveTextContent("subiu 0,03 kg");
  });

  it("Segmentar: alterna para gordura, grava ?tipo=gordura e mostra a nota da estimativa", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia?aba=segmentar");

    await user.click(await screen.findByRole("button", { name: "Gordura" }));

    expect(screen.getByTestId("location")).toHaveTextContent("tipo=gordura");
    const list = within(screen.getByRole("list", { name: "Gordura por região" }));
    expect(list.getByText("Tronco").closest("li")).toHaveTextContent("Acima");
    expect(screen.getByText(/estimada pelo equipamento/)).toBeVisible();
  });

  it("Segmentar acompanha a avaliação escolhida e a variação é contra a anterior a ela", async () => {
    renderAt("/bioimpedancia?aba=segmentar&avaliacao=a-3");

    expect(await screen.findByRole("heading", { name: "Desde 16/03/2026" })).toBeVisible();
  });

  it("Segmentar com uma avaliação só: sem variação, com aviso", async () => {
    items = [A_4];
    renderAt("/bioimpedancia?aba=segmentar");

    expect(await screen.findByText("A variação aparece a partir da segunda avaliação.")).toBeVisible();
    expect(screen.queryByText(/Desde/)).not.toBeInTheDocument();
  });

  it("Segmentar sem dados de região mostra o estado vazio", async () => {
    items = [A_1];
    renderAt("/bioimpedancia?aba=segmentar");

    expect(await screen.findByText(/não traz a massa magra por região do corpo/)).toBeVisible();
  });

  it("Resumo e Valores continuam funcionando ao lado das novas abas", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia");

    expect(await screen.findByRole("list", { name: "Métricas da avaliação" })).toBeVisible();
    for (const name of ["Resumo", "Evolução", "Segmentar", "Valores"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Valores" }));
    expect(screen.getByTestId("location")).toHaveTextContent("aba=valores");
  });

  it("Evolução não mostra o seletor de avaliação nem a exclusão; as outras abas mostram", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia?aba=evolucao");
    await screen.findByRole("img", { name: /Evolução de Peso/ });

    expect(screen.queryByRole("combobox", { name: "Avaliação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir esta avaliação" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Segmentar" }));
    expect(screen.getByRole("combobox", { name: "Avaliação" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Excluir esta avaliação" })).toBeVisible();
  });

  it("D-042: com a autorização revogada, Evolução e Segmentar seguem visíveis para o cliente", async () => {
    consented = false;
    renderAt("/bioimpedancia?aba=evolucao");

    expect(await screen.findByRole("img", { name: /Evolução de Peso/ })).toBeVisible();
    expect(screen.getByText(/O registro está desligado/)).toBeVisible();
  });

  it("sem conexão: continua mostrando o gráfico salvo e avisa", async () => {
    renderAt("/bioimpedancia?aba=evolucao");
    await screen.findByRole("img", { name: /Evolução de Peso/ });

    setBrowserOnline(false);

    expect(await screen.findByText(/Mostrando a última versão salva/)).toBeVisible();
    expect(screen.getByRole("img", { name: /Evolução de Peso/ })).toBeVisible();
  });

  it("erro ao listar mostra a mensagem do bloco", async () => {
    listFails = true;
    renderAt("/bioimpedancia?aba=evolucao");

    expect(await screen.findByText("Não foi possível carregar suas avaliações.")).toBeVisible();
  });
});
