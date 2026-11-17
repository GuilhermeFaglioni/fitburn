import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { Module, PermissionAction, PermissionScope, type EffectivePermission } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { LojaAdminPage } from "../src/pages/LojaAdminPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

/** Exportar pedidos em CSV na aba Pedidos da Loja (L8, #202). Dados fictícios. */

// Terça-feira 17/11/2026, 12h00 na academia (America/Sao_Paulo, UTC-3).
const NOW = new Date("2026-11-17T15:00:00Z");
const BUTTON_NAME = "Exportar pedidos (CSV)";

const CSV_BYTES = new Uint8Array([
  0xef,
  0xbb,
  0xbf,
  ...new TextEncoder().encode("pedido;cliente;produto;quantidade\r\n#0043;Cliente Exemplo;Camiseta Dry Fit;2\r\n"),
]);

const VIEW_ONLY: EffectivePermission[] = [
  { module: Module.LOJA, actions: [PermissionAction.VIEW], scope: PermissionScope.ALL },
];

function LoggedIn() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return <LojaAdminPage tab="pedidos" />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/loja-admin"]}>
          <LoggedIn />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Exportar pedidos (CSV) na aba Pedidos", () => {
  let createdBlobs: Blob[];
  let downloads: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    createdBlobs = [];
    downloads = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return `blob:fitburn-teste-${createdBlobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    mockSuccessfulLogin("Administrador", VIEW_ONLY);
    server.use(http.get("/api/shop/admin/orders", () => HttpResponse.json([])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    onlineManager.setOnline(true);
    setBrowserOnline(true);
  });

  function mockExport(handler?: () => Response | Promise<Response>) {
    const requests: URL[] = [];
    server.use(
      http.get("/api/exports/shop-orders", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return (
          handler?.() ??
          new HttpResponse(CSV_BYTES, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="pedidos_${url.searchParams.get("from")}_${url.searchParams.get("to")}.csv"`,
            },
          })
        );
      }),
    );
    return requests;
  }

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: BUTTON_NAME }));
    return screen.getByRole("dialog", { name: BUTTON_NAME });
  }

  it("o botão aparece com Ver da Loja e some sem a permissão", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: BUTTON_NAME })).toBeInTheDocument();
  });

  it("sem Ver da Loja, o botão não aparece", async () => {
    mockSuccessfulLogin("Administrador", []);
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Pedidos" });
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).not.toBeInTheDocument();
  });

  it("com 'Todo o período' no filtro, o padrão são os últimos 30 dias; enviar baixa o arquivo com os bytes intactos", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(within(dialog).getByLabelText("De")).toHaveValue("2026-10-19");
    expect(within(dialog).getByLabelText("Até")).toHaveValue("2026-11-17");

    await user.click(within(dialog).getByRole("button", { name: "Exportar" }));

    await waitFor(() => expect(downloads).toEqual(["pedidos_2026-10-19_2026-11-17.csv"]));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("from")).toBe("2026-10-19");
    expect(requests[0]!.searchParams.get("to")).toBe("2026-11-17");
    expect(new Uint8Array(await createdBlobs[0]!.arrayBuffer())).toEqual(CSV_BYTES);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("o padrão acompanha o filtro de período da aba", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Período"), "week");

    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText("De")).toHaveValue("2026-11-16");
    expect(within(dialog).getByLabelText("Até")).toHaveValue("2026-11-17");
  });

  it("envia o período editado no diálogo", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    fireEvent.change(within(dialog).getByLabelText("De"), { target: { value: "2026-11-01" } });
    fireEvent.change(within(dialog).getByLabelText("Até"), { target: { value: "2026-11-10" } });
    await user.click(within(dialog).getByRole("button", { name: "Exportar" }));

    await waitFor(() => expect(downloads).toEqual(["pedidos_2026-11-01_2026-11-10.csv"]));
    expect(requests[0]!.searchParams.get("from")).toBe("2026-11-01");
    expect(requests[0]!.searchParams.get("to")).toBe("2026-11-10");
  });

  it.each([
    ["período invertido", "A data inicial não pode ser posterior à data final."],
    ["mais de 92 dias", "O período máximo da exportação é de 92 dias."],
  ])("erro da API (%s): mostra a mensagem dela, não baixa e mantém o diálogo aberto", async (_caso, message) => {
    mockExport(() => HttpResponse.json({ code: "VALIDATION_ERROR", message }, { status: 400 }));
    renderPage();
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Exportar" }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(downloads).toEqual([]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Exportar" })).toBeEnabled();
  });

  it("sem as duas datas, Exportar fica desabilitado", async () => {
    renderPage();
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    fireEvent.change(within(dialog).getByLabelText("De"), { target: { value: "" } });

    expect(within(dialog).getByRole("button", { name: "Exportar" })).toBeDisabled();
  });

  it("offline, Exportar fica desabilitado com o motivo e nada é pedido", async () => {
    const requests = mockExport();
    renderPage();
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    setBrowserOnline(false);

    const exportButton = within(dialog).getByRole("button", { name: "Exportar" });
    await waitFor(() => expect(exportButton).toBeDisabled());
    expect(exportButton).toHaveAttribute("title", expect.stringMatching(/conex/i));
    expect(requests).toEqual([]);
  });
});
