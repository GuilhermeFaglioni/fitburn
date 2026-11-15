import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type AssessmentClient,
  type BioimpedanceAssessment,
  type EffectivePermission,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AssessmentFormPage } from "../src/pages/bioimpedance/AssessmentFormPage";
import { BioimpedanceAdminPage } from "../src/pages/bioimpedance/BioimpedanceAdminPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const ALL_ACTIONS = [
  PermissionAction.VIEW,
  PermissionAction.CREATE,
  PermissionAction.EDIT,
  PermissionAction.DELETE,
];

function permissions(actions: EffectivePermission["actions"] = ALL_ACTIONS): EffectivePermission[] {
  return [{ module: Module.BIOIMPEDANCIA, actions, scope: PermissionScope.ALL }];
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
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
        <Route path="/bioimpedancia-admin" element={<BioimpedanceAdminPage />} />
        <Route path="/bioimpedancia-admin/nova" element={<AssessmentFormPage />} />
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

function assessment(
  id: string,
  clientName: string,
  overrides: Partial<BioimpedanceAssessment> = {},
): BioimpedanceAssessment {
  return {
    id,
    clientId: `c-${id}`,
    clientName,
    measuredAt: "2026-11-11T09:11:00.000Z",
    heightCm: 172,
    age: 30,
    source: "FOTO_DO_LAUDO",
    authorName: "Prof. Exemplo",
    schemaVersion: 1,
    measures: { weight: { value: 69.2 }, bodyFatPercent: { value: 19.2 } },
    createdAt: "2026-11-11T09:30:00.000Z",
    updatedAt: "2026-11-11T09:30:00.000Z",
    ...overrides,
  };
}

const CLIENTS: AssessmentClient[] = [
  { id: "c-ok", fullName: "Cliente Exemplo", email: "ok@fitburn.local", consented: true, consentedAt: "2026-10-02T12:00:00.000Z" },
  { id: "c-no", fullName: "Aluno Teste", email: "no@fitburn.local", consented: false, consentedAt: null },
];

type Call = { method: string; path: string; body?: unknown; search?: string };

describe("Bioimpedância no admin", () => {
  let items: BioimpedanceAssessment[];
  const calls: Call[] = [];

  const lastCall = (method: string, path: string) =>
    [...calls].reverse().find((call) => call.method === method && call.path === path);

  beforeEach(() => {
    calls.length = 0;
    items = [
      assessment("a1", "Cliente Exemplo"),
      assessment("a2", "Aluna Teste", {
        measuredAt: "2026-11-09T21:40:00.000Z",
        source: "MANUAL",
        authorName: "Recepção Teste",
        measures: { weight: { value: 58.4 }, bodyFatPercent: { value: 24.8 } },
      }),
    ];
    mockSuccessfulLogin("Administrador", permissions());
    server.use(
      http.get("/api/bioimpedance/assessments/clients", () => HttpResponse.json(CLIENTS)),
      http.get("/api/bioimpedance/assessments", ({ request }) => {
        calls.push({ method: "GET", path: "/api/bioimpedance/assessments", search: new URL(request.url).search });
        return HttpResponse.json({ items, hiddenReason: null });
      }),
      http.get("/api/bioimpedance/assessments/:id", ({ params }) => {
        const found = items.find((item) => item.id === params.id);
        return found
          ? HttpResponse.json(found)
          : HttpResponse.json({ code: "NOT_FOUND", message: "Avaliação não encontrada." }, { status: 404 });
      }),
      http.post("/api/bioimpedance/assessments", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: "POST", path: "/api/bioimpedance/assessments", body });
        if (body.measuredAt === "2026-11-11T09:11:00.000Z")
          return HttpResponse.json(
            { code: "ASSESSMENT_ALREADY_EXISTS", message: "Já existe uma avaliação deste cliente nessa data e hora." },
            { status: 409 },
          );
        return HttpResponse.json(assessment("new", "Cliente Exemplo"), { status: 201 });
      }),
      http.patch("/api/bioimpedance/assessments/:id", async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: "PATCH", path: `/api/bioimpedance/assessments/${String(params.id)}`, body });
        return HttpResponse.json(items.find((item) => item.id === params.id));
      }),
      http.delete("/api/bioimpedance/assessments/:id", ({ params }) => {
        calls.push({ method: "DELETE", path: `/api/bioimpedance/assessments/${String(params.id)}` });
        items = items.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
  });

  describe("avaliações recentes", () => {
    it("lista cliente, data, peso, PGC, origem e quem registrou", async () => {
      renderAt("/bioimpedancia-admin");
      expect(await screen.findByRole("heading", { level: 1, name: "Avaliações" })).toBeInTheDocument();
      const first = (await screen.findByText("Cliente Exemplo", { selector: "td" })).closest("tr")!;
      expect(within(first).getByText("11/11/2026 · 06:11")).toBeInTheDocument();
      expect(within(first).getByText("69,2 kg")).toBeInTheDocument();
      expect(within(first).getByText("19,2%")).toBeInTheDocument();
      expect(within(first).getByText("FOTO DO LAUDO")).toBeInTheDocument();
      expect(within(first).getByText("Prof. Exemplo")).toBeInTheDocument();
      const second = screen.getByText("Aluna Teste", { selector: "td" }).closest("tr")!;
      expect(within(second).getByText("MANUAL")).toBeInTheDocument();
      expect(within(second).getByText("Recepção Teste")).toBeInTheDocument();
    });

    it("troca o período e refaz a consulta", async () => {
      const user = userEvent.setup();
      renderAt("/bioimpedancia-admin");
      await screen.findByText("Cliente Exemplo", { selector: "td" });
      expect(lastCall("GET", "/api/bioimpedance/assessments")?.search).toContain("from=");
      await user.click(screen.getByRole("button", { name: "Tudo" }));
      await waitFor(() => expect(lastCall("GET", "/api/bioimpedance/assessments")?.search).not.toContain("from="));
    });

    it("mostra estado vazio explicando o consentimento", async () => {
      items = [];
      renderAt("/bioimpedancia-admin");
      expect(await screen.findByText("Nenhuma avaliação neste período.")).toBeInTheDocument();
      expect(screen.getByText(/Só aparecem clientes que autorizaram/)).toBeInTheDocument();
    });

    it("excluir pede confirmação e só então apaga", async () => {
      const user = userEvent.setup();
      renderAt("/bioimpedancia-admin");
      await screen.findByText("Aluna Teste", { selector: "td" });
      await user.click(screen.getByRole("button", { name: /Excluir avaliação de Aluna Teste/ }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/definitiva/)).toBeInTheDocument();
      expect(lastCall("DELETE", "/api/bioimpedance/assessments/a2")).toBeUndefined();
      await user.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
      await waitFor(() => expect(lastCall("DELETE", "/api/bioimpedance/assessments/a2")).toBeDefined());
      await waitFor(() => expect(screen.queryByText("Aluna Teste", { selector: "td" })).not.toBeInTheDocument());
    });

    it("sem Criar, Editar e Excluir os botões ficam desabilitados com o motivo", async () => {
      mockSuccessfulLogin("Administrador", permissions([PermissionAction.VIEW]));
      renderAt("/bioimpedancia-admin");
      await screen.findByText("Cliente Exemplo", { selector: "td" });
      const create = screen.getByRole("button", { name: "+ Nova avaliação" });
      expect(create).toBeDisabled();
      expect(create).toHaveAttribute("title", "Você não tem permissão para registrar avaliações.");
      expect(screen.getAllByRole("button", { name: /^Editar avaliação/ })[0]).toBeDisabled();
      expect(screen.getAllByRole("button", { name: /^Excluir avaliação/ })[0]).toBeDisabled();
    });

    it("Nova avaliação leva ao passo do cliente", async () => {
      const user = userEvent.setup();
      renderAt("/bioimpedancia-admin");
      await user.click(await screen.findByRole("button", { name: "+ Nova avaliação" }));
      expect(await screen.findByRole("heading", { level: 1, name: "Nova avaliação" })).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/bioimpedancia-admin/nova");
    });
  });

  describe("nova avaliação", () => {
    it("bloqueia o cliente sem consentimento com o motivo e a orientação", async () => {
      const user = userEvent.setup();
      renderAt("/bioimpedancia-admin/nova");
      await screen.findByRole("option", { name: "Aluno Teste" });
      await user.selectOptions(screen.getByLabelText("Cliente"), "c-no");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Aluno Teste ainda não autorizou o registro da bioimpedância. Peça para a pessoa ligar em Perfil › Privacidade no app.",
      );
      expect(screen.getByRole("button", { name: "Preencher manualmente" })).toBeDisabled();
    });

    it("com consentimento mostra a data da autorização e abre o formulário agrupado como no laudo", async () => {
      const user = userEvent.setup();
      renderAt("/bioimpedancia-admin/nova");
      await screen.findByRole("option", { name: "Cliente Exemplo" });
      await user.selectOptions(screen.getByLabelText("Cliente"), "c-ok");
      expect(screen.getByText("Autorizou o registro em 02/10/2026.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Preencher manualmente" }));

      expect(screen.getByRole("form", { name: "Nova avaliação" })).toBeInTheDocument();
      for (const group of [
        "Composição corporal",
        "Músculo e gordura",
        "Obesidade (IMC e PGC)",
        "Massa magra segmentar",
        "Gordura segmentar",
        "Controle de peso",
        "Dados adicionais",
        "Impedância (20 e 100 kHz)",
        "Pontuação InBody",
      ]) {
        expect(screen.getByRole("heading", { level: 2, name: group })).toBeInTheDocument();
      }
      expect(screen.getByLabelText("Peso (kg)")).toBeInTheDocument();
      expect(screen.getByLabelText("Braço esquerdo · massa magra (kg)")).toBeInTheDocument();
    });

    async function openForm(user: ReturnType<typeof userEvent.setup>) {
      renderAt("/bioimpedancia-admin/nova");
      await screen.findByRole("option", { name: "Cliente Exemplo" });
      await user.selectOptions(screen.getByLabelText("Cliente"), "c-ok");
      await user.click(screen.getByRole("button", { name: "Preencher manualmente" }));
    }

    it("não salva sem tocar em Salvar e aponta data e peso obrigatórios", async () => {
      const user = userEvent.setup();
      await openForm(user);
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
      expect(await screen.findByText("Informe a data da avaliação.")).toBeInTheDocument();
      expect(screen.getByText("Informe a hora da avaliação.")).toBeInTheDocument();
      expect(screen.getByText("O peso é obrigatório.")).toBeInTheDocument();
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    });

    it("marca 'conferir' quando a soma da composição não bate com o peso e limpa ao corrigir", async () => {
      const user = userEvent.setup();
      await openForm(user);
      await user.type(screen.getByLabelText("Peso (kg)"), "69,2");
      await user.type(screen.getByLabelText("Água corporal total (L)"), "40,9");
      await user.type(screen.getByLabelText("Proteína (kg)"), "13,2");
      await user.type(screen.getByLabelText("Minerais (kg)"), "3,82");
      await user.type(screen.getByLabelText("Massa de gordura (kg)"), "13,3");

      const status = await screen.findByRole("status", { name: "Checagens da avaliação" });
      expect(status).toHaveTextContent("5 campos para conferir");
      expect(status).toHaveTextContent(/somam 71,22 kg, mas o peso é 69,2 kg/);
      expect(screen.getAllByText("Conferir")).toHaveLength(5);

      await user.clear(screen.getByLabelText("Proteína (kg)"));
      await user.type(screen.getByLabelText("Proteína (kg)"), "11,2");
      await waitFor(() => expect(screen.queryByText("Conferir")).not.toBeInTheDocument());
    });

    it("salva com data e hora do laudo (fuso da academia), origem manual e medidas em número", async () => {
      const user = userEvent.setup();
      await openForm(user);
      await user.type(screen.getByLabelText("Data da avaliação"), "2026-11-10");
      await user.type(screen.getByLabelText("Hora da avaliação"), "06:11");
      await user.type(screen.getByLabelText("Altura (cm)"), "172");
      await user.type(screen.getByLabelText("Peso (kg)"), "69,2");
      await user.type(screen.getByLabelText("Peso (kg): faixa mínima"), "56");
      await user.type(screen.getByLabelText("Peso (kg): faixa máxima"), "75,7");
      await user.selectOptions(screen.getByLabelText("Peso (kg): avaliação"), "NORMAL");
      await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));

      await waitFor(() => expect(lastCall("POST", "/api/bioimpedance/assessments")).toBeDefined());
      expect(lastCall("POST", "/api/bioimpedance/assessments")?.body).toEqual({
        clientId: "c-ok",
        measuredAt: "2026-11-10T09:11:00.000Z",
        heightCm: 172,
        source: "MANUAL",
        measures: { weight: { value: 69.2, rangeMin: 56, rangeMax: 75.7, rating: "NORMAL" } },
      });
      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/bioimpedancia-admin"));
    });

    it("mostra o erro da API quando a avaliação é duplicada e mantém o formulário", async () => {
      const user = userEvent.setup();
      await openForm(user);
      await user.type(screen.getByLabelText("Data da avaliação"), "2026-11-11");
      await user.type(screen.getByLabelText("Hora da avaliação"), "06:11");
      await user.type(screen.getByLabelText("Peso (kg)"), "69,2");
      await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
      expect(await screen.findByText("Já existe uma avaliação deste cliente nessa data e hora.")).toBeInTheDocument();
      expect(screen.getByLabelText("Peso (kg)")).toHaveValue("69,2");
    });

    it("recusa valor fora dos limites do catálogo antes de enviar", async () => {
      const user = userEvent.setup();
      await openForm(user);
      await user.type(screen.getByLabelText("Data da avaliação"), "2026-11-11");
      await user.type(screen.getByLabelText("Hora da avaliação"), "06:11");
      await user.type(screen.getByLabelText("Peso (kg)"), "999");
      await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
      expect(await screen.findByText(/fora do limite plausível/)).toBeInTheDocument();
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    });
  });

  describe("editar", () => {
    it("carrega os valores salvos e envia a correção", async () => {
      const user = userEvent.setup();
      renderAt("/bioimpedancia-admin/a1/editar");
      expect(await screen.findByRole("heading", { level: 1, name: "Editar avaliação" })).toBeInTheDocument();
      const weight = await screen.findByLabelText("Peso (kg)");
      expect(weight).toHaveValue("69,2");
      expect(screen.getByLabelText("Data da avaliação")).toHaveValue("2026-11-11");
      expect(screen.getByLabelText("Hora da avaliação")).toHaveValue("06:11");
      expect(screen.getByText("Cliente Exemplo", { selector: "strong" })).toBeInTheDocument();

      await user.clear(weight);
      await user.type(weight, "70,1");
      await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
      await waitFor(() => expect(lastCall("PATCH", "/api/bioimpedance/assessments/a1")).toBeDefined());
      const body = lastCall("PATCH", "/api/bioimpedance/assessments/a1")?.body as {
        measures: { weight: { value: number } };
        heightCm: number;
      };
      expect(body.measures.weight.value).toBe(70.1);
      expect(body.heightCm).toBe(172);
    });
  });
});
