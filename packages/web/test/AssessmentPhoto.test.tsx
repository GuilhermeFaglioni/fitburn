import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type AssessmentClient,
  type EffectivePermission,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import type { ReadField, ReadResult } from "../src/lib/bioimpedance/reader/types";
import { AssessmentFormPage } from "../src/pages/bioimpedance/AssessmentFormPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

// O OCR real roda em Node nos testes do leitor; aqui a fronteira é mockada com uma leitura sintética.
const readReportFile = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/bioimpedance/reader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/bioimpedance/reader")>()),
  readReportFile,
}));

const field = (key: string, value: number | string | null, status: ReadField["status"] = "ok"): ReadField => ({
  key,
  value,
  confidence: status === "ok" ? 90 : 40,
  status,
  raw: "",
});

/** Valores fictícios, coerentes entre si (nada de pessoa real). */
function syntheticRead(overrides: Partial<ReadResult> = {}): ReadResult {
  return {
    templateVersion: 2,
    looksLikeReport: true,
    warning: null,
    fields: [
      field("measuredAt", "2026-03-15T09:30"),
      field("height", 170),
      field("age", 30),
      field("weight", 70),
      field("bodyFatMass", 14),
      field("bodyFatPercent", 20),
      field("bmi", null, "check"),
      field("leanLeftArm", 3.1),
      field("leanLeftArmPercent", 101.5),
      field("leanLeftArmRating", "Normal"),
      field("fatFreeMass", null, "missing"),
    ],
    ...overrides,
  };
}

const CLIENTS: AssessmentClient[] = [
  { id: "c-ok", fullName: "Cliente Exemplo", email: "ok@fitburn.local", consented: true, consentedAt: "2026-10-02T12:00:00.000Z" },
];

function permissions(actions: EffectivePermission["actions"]): EffectivePermission[] {
  return [{ module: Module.BIOIMPEDANCIA, actions, scope: PermissionScope.ALL }];
}

function LoggedIn() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/bioimpedancia-admin" element={<p>Lista</p>} />
      <Route path="/bioimpedancia-admin/nova" element={<AssessmentFormPage />} />
    </Routes>
  );
}

function renderNew() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/bioimpedancia-admin/nova"]}>
          <LoggedIn />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const JPG = () => new File([new Uint8Array([1, 2, 3])], "laudo-sintetico.jpg", { type: "image/jpeg" });

async function chooseAndRead(user: ReturnType<typeof userEvent.setup>, file: File = JPG()) {
  await screen.findByRole("option", { name: "Cliente Exemplo" });
  await user.selectOptions(screen.getByLabelText("Cliente"), "c-ok");
  await user.upload(screen.getByLabelText("Arquivo do laudo"), file);
  await user.click(screen.getByRole("button", { name: "Ler o laudo" }));
}

describe("Nova avaliação pela foto do laudo", () => {
  let posts: Record<string, unknown>[];
  let duplicate = false;

  beforeEach(() => {
    posts = [];
    duplicate = false;
    readReportFile.mockReset();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:laudo"), revokeObjectURL: vi.fn() }));
    mockSuccessfulLogin(
      "Administrador",
      permissions([PermissionAction.VIEW, PermissionAction.CREATE]),
    );
    server.use(
      http.get("/api/bioimpedance/assessments/clients", () => HttpResponse.json(CLIENTS)),
      http.post("/api/bioimpedance/assessments", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posts.push(body);
        if (duplicate)
          return HttpResponse.json(
            { code: "ASSESSMENT_ALREADY_EXISTS", message: "Já existe uma avaliação deste cliente nessa data e hora." },
            { status: 409 },
          );
        return HttpResponse.json({ id: "n1" }, { status: 201 });
      }),
    );
  });

  it("lê o laudo, preenche o formulário e marca o que precisa de conferência", async () => {
    readReportFile.mockResolvedValue(syntheticRead());
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);

    expect(await screen.findByText(/9 valores lidos, 1 para conferir/)).toBeInTheDocument();
    expect(screen.getByLabelText("Data da avaliação")).toHaveValue("2026-03-15");
    expect(screen.getByLabelText("Hora da avaliação")).toHaveValue("09:30");
    expect(screen.getByLabelText("Altura (cm)")).toHaveValue("170");
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue("70");
    expect(screen.getByLabelText("IMC (kg/m²)")).toHaveValue("");
    expect(screen.getByAltText(/usada só neste navegador/)).toBeInTheDocument();
    // IMC (check, sem valor) e o card de conferência.
    const bmi = screen.getByLabelText("IMC (kg/m²)").closest(".fb-bio-measure")!;
    expect(bmi).toHaveClass("fb-bio-measure--flag");
    expect(within(bmi as HTMLElement).getByText("Conferir")).toBeInTheDocument();
  });

  it("só salva com a ação explícita e com origem FOTO_DO_LAUDO", async () => {
    readReportFile.mockResolvedValue(syntheticRead());
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    await screen.findByText(/valores lidos/);
    expect(posts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      clientId: "c-ok",
      source: "FOTO_DO_LAUDO",
      measuredAt: "2026-03-15T12:30:00.000Z",
      heightCm: 170,
      age: 30,
    });
    expect(JSON.stringify(posts[0])).not.toContain("blob:");
    expect(await screen.findByText("Lista")).toBeInTheDocument();
  });

  it("avaliação duplicada mostra a mensagem e não sai da tela", async () => {
    duplicate = true;
    readReportFile.mockResolvedValue(syntheticRead());
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    await screen.findByText(/valores lidos/);
    await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
    expect(await screen.findByText(/Já existe uma avaliação deste cliente nessa data e hora/)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Nova avaliação" })).toBeInTheDocument();
  });

  it("editar um campo marcado tira a marca de conferência", async () => {
    readReportFile.mockResolvedValue(syntheticRead());
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    await screen.findByText(/valores lidos/);
    await user.type(screen.getByLabelText("IMC (kg/m²)"), "24,2");
    const bmi = screen.getByLabelText("IMC (kg/m²)").closest(".fb-bio-measure")!;
    expect(bmi).not.toHaveClass("fb-bio-measure--flag");
  });

  it("imagem que não parece laudo avisa e deixa o formulário vazio", async () => {
    readReportFile.mockResolvedValue({
      templateVersion: 2,
      looksLikeReport: false,
      warning: "Esta imagem não parece um laudo InBody120.",
      fields: [],
    });
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    expect(await screen.findByText("Esta imagem não parece um laudo InBody120.")).toBeInTheDocument();
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue("");
    expect(screen.queryByText(/valores lidos/)).not.toBeInTheDocument();
  });

  it("falha na leitura oferece preencher à mão", async () => {
    readReportFile.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    expect(await screen.findByText(/Não foi possível ler o laudo/)).toBeInTheDocument();
    expect(screen.getByLabelText("Peso (kg)")).toBeInTheDocument();
  });

  it("mostra o carregando enquanto o leitor trabalha", async () => {
    readReportFile.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    expect(await screen.findByText(/Lendo o laudo neste aparelho/)).toBeInTheDocument();
  });

  it("recusa arquivo que não é JPG ou PNG e não chama o leitor", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderNew();
    await screen.findByRole("option", { name: "Cliente Exemplo" });
    await user.upload(screen.getByLabelText("Arquivo do laudo"), new File(["x"], "nota.pdf", { type: "application/pdf" }));
    expect(screen.getByText("Escolha uma imagem JPG ou PNG do laudo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ler o laudo" })).toBeDisabled();
    expect(readReportFile).not.toHaveBeenCalled();
  });

  it("sem a permissão de criar, o salvar fica desabilitado depois da leitura", async () => {
    mockSuccessfulLogin("Administrador", permissions([PermissionAction.VIEW]));
    readReportFile.mockResolvedValue(syntheticRead());
    const user = userEvent.setup();
    renderNew();
    await chooseAndRead(user);
    await screen.findByText(/valores lidos/);
    expect(screen.getByRole("button", { name: "Salvar avaliação" })).toHaveAttribute("aria-disabled", "true");
  });
});
