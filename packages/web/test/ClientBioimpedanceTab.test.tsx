import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type AssessmentsHiddenReasonName,
  type BioimpedanceAssessment,
  type ClientOverview,
  type EffectivePermission,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AssessmentFormPage } from "../src/pages/bioimpedance/AssessmentFormPage";
import { ClientDetailPage } from "../src/pages/ClientDetailPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

const BIO = [
  PermissionAction.VIEW,
  PermissionAction.CREATE,
  PermissionAction.EDIT,
  PermissionAction.DELETE,
];

function permissions(bio: EffectivePermission["actions"] | null): EffectivePermission[] {
  const clients: EffectivePermission = {
    module: Module.CLIENTES,
    actions: [PermissionAction.VIEW, PermissionAction.EDIT],
    scope: PermissionScope.ALL,
  };
  return bio === null ? [clients] : [clients, { module: Module.BIOIMPEDANCIA, actions: bio, scope: PermissionScope.ALL }];
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function LoggedIn() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return (
    <>
      <Routes>
        <Route path="/clientes/:id" element={<ClientDetailPage />} />
        <Route path="/bioimpedancia-admin/:id/editar" element={<AssessmentFormPage />} />
      </Routes>
      <LocationProbe />
    </>
  );
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const OVERVIEW: ClientOverview = {
  client: {
    id: "c-marina",
    email: "marina@email.com",
    fullName: "Marina Souza",
    phone: null,
    status: "ACTIVE",
    profile: { id: "p-client", name: "Cliente" },
  },
  plan: { active: null, history: [] },
  upcomingReservations: [],
  pastReservations: [],
  gamification: {
    totalPoints: 0,
    history: [],
    streak: { current: 0, next: null },
    badges: [],
  },
  workoutSheets: [],
} as unknown as ClientOverview;

function assessment(id: string, overrides: Partial<BioimpedanceAssessment>): BioimpedanceAssessment {
  return {
    id,
    clientId: "c-marina",
    clientName: "Marina Souza",
    measuredAt: "2026-11-11T09:11:00.000Z",
    heightCm: 172,
    age: 30,
    source: "FOTO_DO_LAUDO",
    authorName: "Prof. Exemplo",
    schemaVersion: 1,
    measures: { weight: { value: 69.2 } },
    createdAt: "2026-11-11T09:30:00.000Z",
    updatedAt: "2026-11-11T09:30:00.000Z",
    ...overrides,
  };
}

const LATEST = assessment("a1", {
  measures: {
    weight: { value: 69.2 },
    skeletalMuscleMass: { value: 31.5 },
    bodyFatPercent: { value: 19.2 },
    inbodyScore: { value: 77 },
  },
});
const PREVIOUS = assessment("a2", {
  measuredAt: "2026-07-03T10:00:00.000Z",
  source: "MANUAL",
  authorName: "Recepção Teste",
  measures: {
    weight: { value: 69.8 },
    skeletalMuscleMass: { value: 31.2 },
    bodyFatPercent: { value: 20.1 },
    inbodyScore: { value: 75 },
  },
});

type Call = { method: string; path: string; search?: string; body?: unknown };

describe("Aba Bioimpedância no detalhe do cliente", () => {
  let items: BioimpedanceAssessment[];
  let hiddenReason: AssessmentsHiddenReasonName | null;
  const calls: Call[] = [];
  const lastCall = (method: string, path: string) =>
    [...calls].reverse().find((call) => call.method === method && call.path === path);

  beforeEach(() => {
    calls.length = 0;
    items = [LATEST, PREVIOUS];
    hiddenReason = null;
    mockSuccessfulLogin("Administrador", permissions(BIO));
    server.use(
      http.get("/api/clients/:id", () => HttpResponse.json(OVERVIEW)),
      http.get("/api/bioimpedance/assessments", ({ request }) => {
        calls.push({ method: "GET", path: "/api/bioimpedance/assessments", search: new URL(request.url).search });
        return HttpResponse.json({ items: hiddenReason ? [] : items, hiddenReason });
      }),
      http.get("/api/bioimpedance/assessments/:id", ({ params }) =>
        HttpResponse.json(items.find((item) => item.id === params.id)),
      ),
      http.patch("/api/bioimpedance/assessments/:id", async ({ params, request }) => {
        calls.push({
          method: "PATCH",
          path: `/api/bioimpedance/assessments/${String(params.id)}`,
          body: await request.json(),
        });
        return HttpResponse.json(items.find((item) => item.id === params.id));
      }),
      http.delete("/api/bioimpedance/assessments/:id", ({ params }) => {
        calls.push({ method: "DELETE", path: `/api/bioimpedance/assessments/${String(params.id)}` });
        items = items.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
  });

  async function openTab(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { level: 1, name: "Marina Souza" });
    await user.click(screen.getByRole("button", { name: "Bioimpedância" }));
  }

  describe("visibilidade", () => {
    it("sem Ver em Bioimpedância a aba não aparece e nada é consultado", async () => {
      mockSuccessfulLogin("Administrador", permissions(null));
      renderAt("/clientes/c-marina");
      await screen.findByRole("heading", { level: 1, name: "Marina Souza" });
      expect(screen.getByRole("button", { name: "Fichas" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Bioimpedância" })).not.toBeInTheDocument();
      expect(calls).toHaveLength(0);
    });

    it("com Criar, Editar e Excluir mas sem Ver a aba também não aparece", async () => {
      mockSuccessfulLogin(
        "Administrador",
        permissions([PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE]),
      );
      renderAt("/clientes/c-marina");
      await screen.findByRole("heading", { level: 1, name: "Marina Souza" });
      expect(screen.queryByRole("button", { name: "Bioimpedância" })).not.toBeInTheDocument();
    });

    it("com Ver a aba aparece e só consulta as avaliações ao abrir", async () => {
      const user = userEvent.setup();
      mockSuccessfulLogin("Administrador", permissions([PermissionAction.VIEW]));
      renderAt("/clientes/c-marina");
      await screen.findByRole("heading", { level: 1, name: "Marina Souza" });
      expect(calls).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: "Bioimpedância" }));
      await screen.findByRole("heading", { level: 2, name: "Avaliações" });
      expect(lastCall("GET", "/api/bioimpedance/assessments")?.search).toContain("clientId=c-marina");
    });

    it("abre direto na aba quando a URL traz ?aba=bioimpedancia", async () => {
      renderAt("/clientes/c-marina?aba=bioimpedancia");
      expect(await screen.findByRole("heading", { level: 2, name: "Avaliações" })).toBeInTheDocument();
    });

    it("?aba=bioimpedancia sem Ver cai nos dados pessoais", async () => {
      mockSuccessfulLogin("Administrador", permissions(null));
      renderAt("/clientes/c-marina?aba=bioimpedancia");
      expect(await screen.findByRole("heading", { level: 2, name: "Dados pessoais" })).toBeInTheDocument();
    });
  });

  describe("KPIs, evolução e lista", () => {
    it("mostra peso, massa muscular, PGC e pontuação da última avaliação, com a variação para a anterior", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      const kpis = await screen.findByRole("list", { name: "Resumo da última avaliação" });
      const items = within(kpis).getAllByRole("listitem");
      expect(items).toHaveLength(4);
      expect(items[0]).toHaveTextContent("Peso");
      expect(items[0]).toHaveTextContent("69,2 kg");
      expect(items[0]).toHaveTextContent("caiu 0,6 kg");
      expect(items[1]).toHaveTextContent("31,5 kg");
      expect(items[1]).toHaveTextContent("subiu 0,3 kg");
      expect(items[2]).toHaveTextContent("19,2 %");
      expect(items[2]).toHaveTextContent("caiu 0,9 pp");
      expect(items[3]).toHaveTextContent("77 pontos");
      expect(items[3]).toHaveTextContent("subiu 2");
    });

    it("reutiliza a evolução do cliente: gráfico, medida e período", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      expect(await screen.findByRole("region", { name: "Evolução de Peso" })).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Medida"), "bodyFatPercent");
      expect(await screen.findByRole("region", { name: "Evolução de Gordura corporal (PGC)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "6 meses" })).toBeInTheDocument();
    });

    it("lista as avaliações da mais recente para a mais antiga, com origem e quem registrou", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      const list = await screen.findByRole("list", { name: "Avaliações do cliente" });
      const rows = within(list).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent("11/11/2026 · 06:11");
      expect(rows[0]).toHaveTextContent("Foto do laudo · Prof. Exemplo");
      expect(rows[1]).toHaveTextContent("03/07/2026 · 07:00");
      expect(rows[1]).toHaveTextContent("Manual · Recepção Teste");
    });

    it("com uma só avaliação não mostra variação", async () => {
      items = [LATEST];
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      const kpis = await screen.findByRole("list", { name: "Resumo da última avaliação" });
      expect(within(kpis).queryByText(/caiu|subiu/)).not.toBeInTheDocument();
    });

    it("sem avaliações mostra o estado vazio", async () => {
      items = [];
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      expect(await screen.findByText("Nenhuma avaliação registrada.")).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Resumo da última avaliação" })).not.toBeInTheDocument();
    });

    it("mostra o carregando e, se a consulta falhar, o erro com nova tentativa", async () => {
      server.use(
        http.get("/api/bioimpedance/assessments", () =>
          HttpResponse.json({ code: "INTERNAL", message: "Falha." }, { status: 500 }),
        ),
      );
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      expect(await screen.findByText("Não foi possível carregar a bioimpedância.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    });
  });

  describe("consentimento", () => {
    it("revogado: mostra o motivo e nenhum dado", async () => {
      hiddenReason = "CONSENT_REVOKED";
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      expect(
        await screen.findByText(/O cliente desligou o registro da bioimpedância/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Resumo da última avaliação" })).not.toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Avaliações do cliente" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /Evolução/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/69,2/)).not.toBeInTheDocument();
    });

    it("sem consentimento: explica e orienta", async () => {
      hiddenReason = "CONSENT_MISSING";
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      expect(await screen.findByText(/O cliente ainda não autorizou o registro da bioimpedância/)).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Avaliações do cliente" })).not.toBeInTheDocument();
    });
  });

  describe("editar", () => {
    it("reabre o formulário da avaliação e, ao salvar, volta para a aba do cliente", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      await user.click(await screen.findByRole("button", { name: "Editar avaliação de 11/11/2026 · 06:11" }));

      expect(await screen.findByRole("form", { name: "Editar avaliação" })).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/bioimpedancia-admin/a1/editar");
      await waitFor(() => expect(screen.getByLabelText("Peso (kg)")).toHaveValue("69,2"));

      await user.clear(screen.getByLabelText("Peso (kg)"));
      await user.type(screen.getByLabelText("Peso (kg)"), "69,0");
      await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
      await waitFor(() => expect(lastCall("PATCH", "/api/bioimpedance/assessments/a1")).toBeDefined());
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent("/clientes/c-marina?aba=bioimpedancia"),
      );
      expect(await screen.findByRole("heading", { level: 2, name: "Avaliações" })).toBeInTheDocument();
    });

    it("Cancelar na edição também volta para a aba do cliente", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      await user.click(await screen.findByRole("button", { name: "Editar avaliação de 11/11/2026 · 06:11" }));
      await user.click(await screen.findByRole("button", { name: "Cancelar" }));
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent("/clientes/c-marina?aba=bioimpedancia"),
      );
    });

    it("sem Editar o botão fica desabilitado, com o motivo", async () => {
      mockSuccessfulLogin("Administrador", permissions([PermissionAction.VIEW, PermissionAction.DELETE]));
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      const edit = await screen.findByRole("button", { name: "Editar avaliação de 11/11/2026 · 06:11" });
      expect(edit).toBeDisabled();
      expect(edit).toHaveAttribute("title", "Você não tem permissão para editar avaliações.");
      expect(screen.getByRole("button", { name: "Excluir avaliação de 11/11/2026 · 06:11" })).toBeEnabled();
    });
  });

  describe("excluir", () => {
    it("pede confirmação sem mostrar os valores e só então apaga", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      await user.click(await screen.findByRole("button", { name: "Excluir avaliação de 03/07/2026 · 07:00" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Excluir a avaliação de 03/07/2026?");
      expect(dialog).toHaveTextContent(/auditoria, sem os valores/);
      expect(dialog).not.toHaveTextContent(/69,8|31,2|20,1/);
      expect(lastCall("DELETE", "/api/bioimpedance/assessments/a2")).toBeUndefined();

      await user.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
      await waitFor(() => expect(lastCall("DELETE", "/api/bioimpedance/assessments/a2")).toBeDefined());
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() =>
        expect(within(screen.getByRole("list", { name: "Avaliações do cliente" })).getAllByRole("listitem")).toHaveLength(1),
      );
    });

    it("cancelar não apaga", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      await user.click(await screen.findByRole("button", { name: "Excluir avaliação de 03/07/2026 · 07:00" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(lastCall("DELETE", "/api/bioimpedance/assessments/a2")).toBeUndefined();
    });

    it("sem Excluir o botão fica desabilitado, com o motivo", async () => {
      mockSuccessfulLogin("Administrador", permissions([PermissionAction.VIEW, PermissionAction.EDIT]));
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      const remove = await screen.findByRole("button", { name: "Excluir avaliação de 11/11/2026 · 06:11" });
      expect(remove).toBeDisabled();
      expect(remove).toHaveAttribute("title", "Você não tem permissão para excluir avaliações.");
      expect(screen.getByRole("button", { name: "Editar avaliação de 11/11/2026 · 06:11" })).toBeEnabled();
    });
  });

  describe("sem conexão", () => {
    it("desabilita Editar e Excluir com o motivo da rede, e reabilita ao voltar", async () => {
      const user = userEvent.setup();
      renderAt("/clientes/c-marina");
      await openTab(user);
      const edit = await screen.findByRole("button", { name: "Editar avaliação de 11/11/2026 · 06:11" });
      expect(edit).toBeEnabled();

      act(() => setBrowserOnline(false));
      expect(edit).toBeDisabled();
      expect(screen.getByRole("button", { name: "Excluir avaliação de 11/11/2026 · 06:11" })).toBeDisabled();
      // O que já foi carregado segue na tela.
      expect(screen.getByRole("list", { name: "Resumo da última avaliação" })).toBeInTheDocument();

      act(() => setBrowserOnline(true));
      expect(edit).toBeEnabled();
    });
  });
});
