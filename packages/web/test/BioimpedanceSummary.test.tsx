import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { BioimpedanceAssessment, CurrentUser } from "@fitburn/contracts";
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

function assessment(id: string, measuredAt: string, weight: number, extra = {}): BioimpedanceAssessment {
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
      skeletalMuscleMass: { value: 31.5 },
      bodyFatPercent: { value: 19.2 },
      bodyFatMass: { value: 13.3 },
      bmi: { value: 23.1 },
      visceralFatLevel: { value: 5 },
      inbodyScore: { value: 77 },
      targetWeight: { value: 65.8 },
      weightControl: { value: -3.4 },
      totalBodyWater: { value: 40.9, rangeMin: 37, rangeMax: 45.2, rating: "NORMAL" },
      ...extra,
    },
  };
}

const NEW = assessment("a-2", "2026-11-11T09:11:00.000Z", 69.2);
const OLD = assessment("a-1", "2026-07-03T19:00:00.000Z", 69.8, { inbodyScore: { value: 75 } });

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

describe("Composição corporal do cliente: Resumo e Valores (#195)", () => {
  let items: BioimpedanceAssessment[];
  let consented: boolean;
  let deleted: string[];
  let listFails: boolean;

  beforeEach(() => {
    setBrowserOnline(true);
    tokenStore.set(null);
    items = [OLD, NEW];
    consented = true;
    deleted = [];
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
      http.delete("/api/bioimpedance/assessments/mine/:id", ({ params }) => {
        deleted.push(String(params.id));
        items = items.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
  });

  afterEach(() => setBrowserOnline(true));

  it("Resumo: avaliação mais recente, pontuação, 6 métricas com variação e controle de peso", async () => {
    renderAt("/bioimpedancia");

    expect(await screen.findByText(/pontuação InBody/)).toBeVisible();
    expect(screen.getByText("+2 pontos desde 03/07/2026")).toBeVisible();
    const metrics = within(screen.getByRole("list", { name: "Métricas da avaliação" }));
    expect(metrics.getAllByRole("listitem")).toHaveLength(6);
    const weight = metrics.getByText("Peso").closest("li") as HTMLElement;
    expect(weight).toHaveTextContent("69,2 kg");
    expect(weight).toHaveTextContent("caiu 0,6 kg");
    expect(screen.getByRole("heading", { name: "Controle de peso" })).toBeVisible();
    expect(screen.getByText("−3,4 kg")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Avaliação" })).toHaveValue("a-2");
  });

  it("a aba e a avaliação ficam na URL; Valores mostra os grupos com a barra Abaixo/Normal/Acima", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia");

    await user.click(await screen.findByRole("button", { name: "Valores" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/bioimpedancia?aba=valores");
    expect(screen.getByText("Composição corporal", { selector: ".fb-ui-accordion__title" })).toBeVisible();
    expect(screen.getByText("Água corporal total")).toBeVisible();
    expect(screen.getByText("Faixa normal: 37–45,2")).toBeVisible();
    expect(screen.getByRole("img", { name: "Água corporal total: Normal" })).toBeVisible();

    await user.selectOptions(screen.getByRole("combobox", { name: "Avaliação" }), "a-1");
    expect(screen.getByTestId("location")).toHaveTextContent("avaliacao=a-1");
  });

  it("abre direto na aba da URL e na avaliação pedida", async () => {
    renderAt("/bioimpedancia?aba=valores&avaliacao=a-1");

    expect(await screen.findByRole("combobox", { name: "Avaliação" })).toHaveValue("a-1");
    expect(screen.getByRole("button", { name: "Valores" })).toHaveAttribute("aria-pressed", "true");
  });

  it("com uma avaliação só, explica que a evolução vem da segunda e não mostra variação", async () => {
    items = [NEW];
    renderAt("/bioimpedancia");

    expect(await screen.findByText(/A evolução aparece a partir da segunda avaliação/)).toBeVisible();
    expect(screen.queryByText(/caiu/)).not.toBeInTheDocument();
  });

  it("sem avaliação e autorizado, avisa que ainda não há nada registrado", async () => {
    items = [];
    renderAt("/bioimpedancia");

    expect(await screen.findByText(/Você ainda não tem avaliações registradas/)).toBeVisible();
  });

  it("D-042: com a autorização revogada o cliente continua vendo as próprias avaliações", async () => {
    consented = false;
    renderAt("/bioimpedancia");

    expect(await screen.findByText(/pontuação InBody/)).toBeVisible();
    expect(screen.getByText(/O registro está desligado/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Autorizar registro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir esta avaliação" })).toBeEnabled();
  });

  it("exclui a avaliação escolhida só depois da confirmação", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia");

    await user.click(await screen.findByRole("button", { name: "Excluir esta avaliação" }));
    const dialog = await screen.findByRole("dialog", { name: /Excluir a avaliação de 11\/11\/2026/ });
    expect(deleted).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(deleted).toEqual(["a-2"]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("combobox", { name: "Avaliação" })).toHaveValue("a-1");
  });

  it("cancelar a confirmação não exclui", async () => {
    const user = userEvent.setup();
    renderAt("/bioimpedancia");

    await user.click(await screen.findByRole("button", { name: "Excluir esta avaliação" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));

    expect(deleted).toEqual([]);
  });

  it("erro ao listar mostra a mensagem do bloco", async () => {
    listFails = true;
    renderAt("/bioimpedancia");

    expect(await screen.findByText("Não foi possível carregar suas avaliações.")).toBeVisible();
  });

  it("sem conexão: mostra a última versão salva e bloqueia a exclusão", async () => {
    renderAt("/bioimpedancia");
    await screen.findByText(/pontuação InBody/);

    setBrowserOnline(false);

    expect(await screen.findByText(/Mostrando a última versão salva/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Excluir esta avaliação" })).toBeDisabled();
  });
});
