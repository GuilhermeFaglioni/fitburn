import { useEffect, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { addDays, gymToday, startOfWeek } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AgendaAdminPage } from "../src/pages/AgendaAdminPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

const WEEK_START = startOfWeek(gymToday());
const WEEK_END = addDays(WEEK_START, 6);
const NEXT_WEEK_START = addDays(WEEK_START, 7);
const NEXT_WEEK_END = addDays(NEXT_WEEK_START, 6);

const BUTTON_NAME = "Exportar ocupação (CSV)";

// Bytes de um CSV fictício: BOM + cabeçalho + uma linha, separados por ";" e CRLF.
const CSV_BYTES = new Uint8Array([
  0xef,
  0xbb,
  0xbf,
  ...new TextEncoder().encode(
    "ocorrencia_id;aula;data_local\r\noc-1;Treino Funcional;2030-01-07\r\n",
  ),
]);

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return <AgendaAdminPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/agenda-administrativa"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Exportar ocupação (CSV) na agenda administrativa", () => {
  let createdBlobs: Blob[];
  let downloads: string[];
  let revoked: string[];

  beforeEach(() => {
    createdBlobs = [];
    downloads = [];
    revoked = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return `blob:fitburn-teste-${createdBlobs.length}`;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    mockSuccessfulLogin("Administrador");
    server.use(http.get("/api/occurrences", () => HttpResponse.json([])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockExport(handler?: () => Response | Promise<Response>) {
    const requests: URL[] = [];
    server.use(
      http.get("/api/exports/occupancy", ({ request }) => {
        requests.push(new URL(request.url));
        return (
          handler?.() ??
          new HttpResponse(CSV_BYTES, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="ocupacao_${new URL(request.url).searchParams.get("from")}_${new URL(request.url).searchParams.get("to")}.csv"`,
            },
          })
        );
      }),
    );
    return requests;
  }

  it("um clique faz um único GET com as datas da semana exibida e baixa o arquivo com os bytes intactos", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`ocupacao_${WEEK_START}_${WEEK_END}.csv`]));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("from")).toBe(WEEK_START);
    expect(requests[0]!.searchParams.get("to")).toBe(WEEK_END);

    expect(createdBlobs).toHaveLength(1);
    const bytes = new Uint8Array(await createdBlobs[0]!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(Array.from(bytes)).toEqual(Array.from(CSV_BYTES));

    await waitFor(() => expect(revoked).toEqual(["blob:fitburn-teste-1"]));
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it("depois de trocar de semana, exporta as datas da nova semana", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Próxima semana" }));
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));

    await waitFor(() =>
      expect(downloads).toEqual([`ocupacao_${NEXT_WEEK_START}_${NEXT_WEEK_END}.csv`]),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("from")).toBe(NEXT_WEEK_START);
    expect(requests[0]!.searchParams.get("to")).toBe(NEXT_WEEK_END);
  });

  it("usa o nome do Content-Disposition e, sem ele, o nome padrão", async () => {
    server.use(
      http.get(
        "/api/exports/occupancy",
        () => new HttpResponse(CSV_BYTES, { headers: { "Content-Type": "text/csv" } }),
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`ocupacao_${WEEK_START}_${WEEK_END}.csv`]));
  });

  it("mostra o estado carregando e ignora o clique duplo (uma só requisição)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = mockExport(async () => {
      await gate;
      return new HttpResponse(CSV_BYTES, {
        headers: { "Content-Disposition": 'attachment; filename="ocupacao.csv"' },
      });
    });
    renderPage();
    const user = userEvent.setup();

    const button = await screen.findByRole("button", { name: BUTTON_NAME });
    await user.dblClick(button);

    const loading = await screen.findByRole("button", { name: "Exportando…" });
    expect(loading).toBeDisabled();
    expect(loading).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      release();
    });
    await waitFor(() => expect(downloads).toEqual(["ocupacao.csv"]));
    expect(requests).toHaveLength(1);
    expect(await screen.findByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it.each([
    [400, "VALIDATION_ERROR", "O período máximo da exportação é de 92 dias."],
    [403, "FORBIDDEN", "Você não tem permissão para exportar."],
  ])("erro %i da API aparece como alerta e nada é baixado", async (status, code, message) => {
    mockExport(() => HttpResponse.json({ code, message }, { status }));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(downloads).toEqual([]);
    expect(createdBlobs).toEqual([]);
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it("falha sem corpo de erro da API mostra a mensagem genérica e a nova tentativa limpa o alerta", async () => {
    let fail = true;
    mockExport(() =>
      fail
        ? new HttpResponse("Bad Gateway", { status: 502 })
        : new HttpResponse(CSV_BYTES, {
            headers: { "Content-Disposition": 'attachment; filename="ocupacao.csv"' },
          }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro inesperado.");

    fail = false;
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));
    await waitFor(() => expect(downloads).toEqual(["ocupacao.csv"]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falha de rede (fetch rejeitado) mostra a mensagem padrão da exportação", async () => {
    mockExport(() => HttpResponse.error());
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível exportar o relatório.",
    );
    expect(downloads).toEqual([]);
  });

  it("sem conexão o botão fica desabilitado com a explicação padrão e volta ao reconectar", async () => {
    const requests = mockExport();
    renderPage();

    const button = await screen.findByRole("button", { name: BUTTON_NAME });
    act(() => setBrowserOnline(false));
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("title", expect.stringContaining("sem conexão"));
    expect(requests).toHaveLength(0);

    act(() => setBrowserOnline(true));
    await waitFor(() => expect(button).toBeEnabled());
  });
});
