import { useEffect, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { addDays, gymToday, startOfWeek } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ReservasAdminPage } from "../src/pages/ReservasAdminPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

const TODAY = gymToday();
const WEEK_START = startOfWeek(TODAY);
const WEEK_END = addDays(WEEK_START, 6);

const BUTTON_NAME = "Exportar reservas (CSV)";
const ALL_HINT = "Escolha Hoje ou Esta semana para exportar.";

// Bytes de um CSV fictício: BOM + cabeçalho + uma linha, separados por ";" e CRLF.
const CSV_BYTES = new Uint8Array([
  0xef,
  0xbb,
  0xbf,
  ...new TextEncoder().encode(
    "ocorrencia_id;aula;data_local;confirmadas\r\noc-1;Treino Funcional;2030-01-07;3\r\n",
  ),
]);

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return <ReservasAdminPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/reservas-administrativas"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Exportar reservas (CSV) nas reservas administrativas", () => {
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
    server.use(http.get("/api/admin/reservations", () => HttpResponse.json([])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockExport(handler?: () => Response | Promise<Response>) {
    const requests: URL[] = [];
    server.use(
      http.get("/api/exports/reservations", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return (
          handler?.() ??
          new HttpResponse(CSV_BYTES, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="reservas_${url.searchParams.get("from")}_${url.searchParams.get("to")}.csv"`,
            },
          })
        );
      }),
    );
    return requests;
  }

  it("com 'Hoje' (padrão), um clique faz um único GET com a data de hoje e baixa o arquivo com os bytes intactos", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`reservas_${TODAY}_${TODAY}.csv`]));
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

  it("com 'Esta semana', exporta de segunda a domingo da semana corrente", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Período"), "week");
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`reservas_${WEEK_START}_${WEEK_END}.csv`]));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("from")).toBe(WEEK_START);
    expect(requests[0]!.searchParams.get("to")).toBe(WEEK_END);
  });

  it("com 'Todas' o botão fica desabilitado com a dica visível e o clique não faz requisição", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Período"), "all");

    const button = screen.getByRole("button", { name: BUTTON_NAME });
    expect(button).toBeDisabled();
    expect(screen.getByText(ALL_HINT)).toBeVisible();
    expect(button).toHaveAccessibleDescription(ALL_HINT);

    await user.click(button);
    expect(requests).toHaveLength(0);
    expect(downloads).toEqual([]);

    // Voltando para um período com intervalo, a dica some e o botão volta a funcionar.
    await user.selectOptions(screen.getByLabelText("Período"), "today");
    expect(screen.queryByText(ALL_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it("usa o nome do Content-Disposition e, sem ele, o nome padrão", async () => {
    server.use(
      http.get(
        "/api/exports/reservations",
        () => new HttpResponse(CSV_BYTES, { headers: { "Content-Type": "text/csv" } }),
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(downloads).toEqual([`reservas_${TODAY}_${TODAY}.csv`]));
  });

  it("mostra o estado carregando e ignora o clique duplo (uma só requisição)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = mockExport(async () => {
      await gate;
      return new HttpResponse(CSV_BYTES, {
        headers: { "Content-Disposition": 'attachment; filename="reservas.csv"' },
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
    await waitFor(() => expect(downloads).toEqual(["reservas.csv"]));
    expect(requests).toHaveLength(1);
    expect(await screen.findByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it.each([
    [403, "OUT_OF_SCOPE", "Seu acesso a Reservas é parcial; o relatório exige escopo total."],
    [400, "VALIDATION_ERROR", "O período máximo da exportação é de 92 dias."],
  ])(
    "erro %i da API aparece como alerta com a mensagem da API e nada é baixado",
    async (status, code, message) => {
      mockExport(() => HttpResponse.json({ code, message }, { status }));
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(downloads).toEqual([]);
      expect(createdBlobs).toEqual([]);
      expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
    },
  );

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
