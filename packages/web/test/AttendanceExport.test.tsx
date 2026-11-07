import { useEffect, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { MyClassesPage } from "../src/pages/MyClassesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

// Quarta-feira 06/05/2026, 18h00 na academia (America/Sao_Paulo, UTC-3).
const NOW = new Date("2026-05-06T21:00:00Z");
const TODAY = "2026-05-06";
const WEEK_START = "2026-05-04"; // segunda
const WEEK_END = "2026-05-10"; // domingo

const BUTTON_NAME = "Exportar presenças (CSV)";

// Bytes de um CSV fictício: BOM + cabeçalho + uma linha, separados por ";" e CRLF.
const CSV_BYTES = new Uint8Array([
  0xef,
  0xbb,
  0xbf,
  ...new TextEncoder().encode(
    "ocorrencia_id;aula;data_local;presentes;faltas;pendentes\r\noc-1;Treino Funcional;2026-05-06;3;1;0\r\n",
  ),
]);

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("rafael@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return <MyClassesPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/minhas-aulas"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Exportar presenças (CSV) em Minhas aulas", () => {
  let createdBlobs: Blob[];
  let downloads: string[];
  let revoked: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
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

    mockSuccessfulLogin("Professor");
    server.use(http.get("/api/attendance/classes", () => HttpResponse.json([])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockExport(handler?: () => Response | Promise<Response>) {
    const requests: URL[] = [];
    server.use(
      http.get("/api/exports/attendance", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return (
          handler?.() ??
          new HttpResponse(CSV_BYTES, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="presencas_${url.searchParams.get("from")}_${url.searchParams.get("to")}.csv"`,
            },
          })
        );
      }),
    );
    return requests;
  }

  it("na aba 'Hoje' (padrão), um clique faz um único GET com a data de hoje e baixa o arquivo com os bytes intactos", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`presencas_${TODAY}_${TODAY}.csv`]));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("from")).toBe(TODAY);
    expect(requests[0]!.searchParams.get("to")).toBe(TODAY);

    expect(createdBlobs).toHaveLength(1);
    const bytes = new Uint8Array(await createdBlobs[0]!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(Array.from(bytes)).toEqual(Array.from(CSV_BYTES));

    await waitFor(() => expect(revoked).toEqual(["blob:fitburn-teste-1"]));
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it("na aba 'Semana' exporta de segunda a domingo e trocar de aba muda o período do próximo clique", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Semana" }));
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`presencas_${WEEK_START}_${WEEK_END}.csv`]));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("from")).toBe(WEEK_START);
    expect(requests[0]!.searchParams.get("to")).toBe(WEEK_END);

    // Voltando para "Hoje", o próximo clique exporta só o dia.
    await user.click(screen.getByRole("button", { name: "Hoje" }));
    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.searchParams.get("from")).toBe(TODAY);
    expect(requests[1]!.searchParams.get("to")).toBe(TODAY);
    expect(downloads).toEqual([
      `presencas_${WEEK_START}_${WEEK_END}.csv`,
      `presencas_${TODAY}_${TODAY}.csv`,
    ]);
  });

  it("usa o nome do Content-Disposition e, sem ele, o nome padrão", async () => {
    server.use(
      http.get(
        "/api/exports/attendance",
        () =>
          new HttpResponse(CSV_BYTES, {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": 'attachment; filename="presencas_do_servidor.csv"',
            },
          }),
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));
    await waitFor(() => expect(downloads).toEqual(["presencas_do_servidor.csv"]));

    server.use(
      http.get(
        "/api/exports/attendance",
        () => new HttpResponse(CSV_BYTES, { headers: { "Content-Type": "text/csv" } }),
      ),
    );
    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));
    await waitFor(() =>
      expect(downloads).toEqual(["presencas_do_servidor.csv", `presencas_${TODAY}_${TODAY}.csv`]),
    );
  });

  it("mostra o estado carregando e ignora o clique duplo (uma só requisição)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = mockExport(async () => {
      await gate;
      return new HttpResponse(CSV_BYTES, {
        headers: { "Content-Disposition": 'attachment; filename="presencas.csv"' },
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
    await waitFor(() => expect(downloads).toEqual(["presencas.csv"]));
    expect(requests).toHaveLength(1);
    expect(await screen.findByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it.each([
    [403, "OUT_OF_SCOPE", "Seu acesso a Presença não se aplica a aulas."],
    [400, "VALIDATION_ERROR", "O período máximo da exportação é de 92 dias."],
  ])(
    "erro %i da API aparece como alerta, nada é baixado e a página continua de pé",
    async (status, code, message) => {
      mockExport(() => HttpResponse.json({ code, message }, { status }));
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(downloads).toEqual([]);
      expect(createdBlobs).toEqual([]);
      expect(screen.getByRole("heading", { name: "Minhas aulas" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
    },
  );

  it("preserva os estados da lista (vazio) ao lado do botão", async () => {
    mockExport();
    renderPage();

    expect(await screen.findByText("Nenhuma aula hoje.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
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
