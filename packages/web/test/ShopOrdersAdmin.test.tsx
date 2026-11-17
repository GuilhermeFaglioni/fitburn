import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type AdminShopOrder,
  type Dashboard,
  type EffectivePermission,
  type ShopOrderStatus,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { DashboardPage } from "../src/pages/DashboardPage";
import { LojaAdminPage } from "../src/pages/LojaAdminPage";
import { periodRange } from "../src/pages/shop/OrdersTab";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

/** Fila de pedidos da Loja no admin e o card do Dashboard (L7, #200). Dados fictícios. */

function order(
  number: number,
  status: ShopOrderStatus,
  overrides: Partial<AdminShopOrder> = {},
): AdminShopOrder {
  return {
    id: `o-${number}`,
    number,
    status,
    observation: null,
    totalCents: 21970,
    createdAt: "2026-11-11T12:12:00.000Z", // 09:12 na academia (UTC-3)
    items: [
      {
        id: `i-${number}-1`,
        variantId: "v-camiseta",
        productName: "Camiseta Dry Fit",
        variantLabel: "Preta · M",
        options: [],
        unitPriceCents: 6990,
        quantity: 2,
        subtotalCents: 13980,
      },
      {
        id: `i-${number}-2`,
        variantId: "v-garrafa",
        productName: "Garrafa térmica",
        variantLabel: null,
        options: [],
        unitPriceCents: 7990,
        quantity: 1,
        subtotalCents: 7990,
      },
    ],
    events: [],
    client: { id: `c-${number}`, fullName: `Cliente Exemplo ${number}` },
    ...overrides,
  };
}

const VIEW_ONLY: EffectivePermission[] = [
  { module: Module.LOJA, actions: [PermissionAction.VIEW], scope: PermissionScope.ALL },
];
const VIEW_AND_EXECUTE: EffectivePermission[] = [
  { module: Module.LOJA, actions: [PermissionAction.VIEW, PermissionAction.EXECUTE], scope: PermissionScope.ALL },
];

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function LoggedIn({ children }: { children: React.ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return children;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn>
            <Routes>
              <Route path="/loja-admin" element={<LojaAdminPage tab="pedidos" />} />
              <Route path="/dashboard" element={<DashboardPage />} />
            </Routes>
            <LocationProbe />
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const TRANSITION_TARGET: Record<string, ShopOrderStatus> = {
  approve: "APROVADO",
  reject: "RECUSADO",
  deliver: "ENTREGUE",
};

describe("Fila de pedidos da Loja (admin)", () => {
  let orders: AdminShopOrder[];
  let pendingCount: number;
  const searches: string[] = [];
  const posts: Array<{ path: string; body: unknown }> = [];

  const lastSearch = () => searches[searches.length - 1]!;

  function useOrderHandlers() {
    server.use(
      http.get("/api/shop/admin/orders", ({ request }) => {
        const url = new URL(request.url);
        searches.push(url.search);
        const status = url.searchParams.get("status");
        const q = url.searchParams.get("q")?.toLowerCase();
        return HttpResponse.json(
          orders.filter(
            (item) =>
              (!status || item.status === status) &&
              (!q ||
                item.client.fullName.toLowerCase().includes(q) ||
                String(item.number).includes(q)),
          ),
        );
      }),
      http.get("/api/shop/admin/orders/pending-count", () => HttpResponse.json({ count: pendingCount })),
      http.post("/api/shop/admin/orders/:id/:action", async ({ params, request }) => {
        const body = request.headers.get("content-type")?.includes("json") ? await request.json() : undefined;
        posts.push({ path: `${String(params.id)}/${String(params.action)}`, body });
        const target = orders.find((item) => item.id === params.id)!;
        const to = TRANSITION_TARGET[String(params.action)]!;
        const valid = to === "ENTREGUE" ? target.status === "APROVADO" : target.status === "AGUARDANDO_APROVACAO";
        if (!valid) {
          return HttpResponse.json(
            { code: "ORDER_INVALID_TRANSITION", message: "Só é possível aprovar ou recusar um pedido que aguarda aprovação." },
            { status: 409 },
          );
        }
        const updated = { ...target, status: to };
        orders = orders.map((item) => (item.id === target.id ? updated : item));
        return HttpResponse.json(updated);
      }),
    );
  }

  beforeEach(() => {
    searches.length = 0;
    posts.length = 0;
    pendingCount = 2;
    orders = [
      order(43, "AGUARDANDO_APROVACAO"),
      order(41, "AGUARDANDO_APROVACAO", {
        createdAt: "2026-11-10T22:30:00.000Z",
        totalCents: 5990,
        items: [
          {
            id: "i-41-1",
            variantId: "v-bone",
            productName: "Boné Fitburn",
            variantLabel: "Preto",
            options: [],
            unitPriceCents: 5990,
            quantity: 1,
            subtotalCents: 5990,
          },
        ],
      }),
      order(42, "APROVADO", { totalCents: 6990 }),
      order(31, "ENTREGUE"),
      order(27, "RECUSADO"),
      order(20, "CANCELADO"),
    ];
    mockSuccessfulLogin("Administrador", VIEW_AND_EXECUTE);
    useOrderHandlers();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    setBrowserOnline(true);
  });

  function row(number: string) {
    return screen.getByText(number, { selector: "td" }).closest("tr")!;
  }

  describe("Lista", () => {
    it("mostra número, cliente, itens, total, data e status; padrão é só os aguardando", async () => {
      renderAt("/loja-admin");

      const table = await screen.findByRole("table", { name: "Pedidos" });
      const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
      expect(headers).toEqual(["Pedido", "Cliente", "Itens", "Total", "Feito em", "Status", "Ações"]);

      const first = row("#0043");
      expect(within(first).getByText("Cliente Exemplo 43")).toBeInTheDocument();
      expect(first).toHaveTextContent("Camiseta Dry Fit (Preta · M) ×2");
      expect(first).toHaveTextContent("Garrafa térmica ×1");
      expect(first).toHaveTextContent(/R\$\s*219,70/);
      expect(first).toHaveTextContent("11/11 · 09:12");
      expect(within(first).getByText("AGUARDANDO APROVAÇÃO")).toBeInTheDocument();

      // O padrão é "aguardando": aprovados e finalizados ficam fora.
      expect(screen.queryByText("#0042", { selector: "td" })).not.toBeInTheDocument();
      expect(searches[0]).toBe("?status=AGUARDANDO_APROVACAO");
    });

    it("mostra o vazio com e sem filtro", async () => {
      orders = [];
      const user = userEvent.setup();
      renderAt("/loja-admin");
      expect(await screen.findByText("Nenhum pedido encontrado.")).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Status"), "");
      await user.selectOptions(screen.getByLabelText("Período"), "all");
      expect(await screen.findByText("Nenhum pedido ainda.")).toBeInTheDocument();
    });

    it("mostra o erro quando a lista não carrega", async () => {
      server.use(
        http.get("/api/shop/admin/orders", () =>
          HttpResponse.json({ code: "INTERNAL_ERROR", message: "Falha." }, { status: 500 }),
        ),
      );
      renderAt("/loja-admin");
      expect(await screen.findByText("Não foi possível carregar os pedidos.")).toBeInTheDocument();
    });
  });

  describe("Filtros", () => {
    it("filtra por status, inclusive Todos", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      await user.selectOptions(screen.getByLabelText("Status"), "Aprovado");
      expect(await screen.findByText("#0042", { selector: "td" })).toBeInTheDocument();
      expect(screen.queryByText("#0043", { selector: "td" })).not.toBeInTheDocument();
      expect(lastSearch()).toBe("?status=APROVADO");

      await user.selectOptions(screen.getByLabelText("Status"), "Todos os status");
      await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(7)); // cabeçalho + 6 pedidos
      expect(lastSearch()).toBe("");
    });

    it("busca por cliente ou número, uma consulta por pausa na digitação", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });
      await user.selectOptions(screen.getByLabelText("Status"), "Todos os status");
      await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(7));
      const before = searches.length;

      await user.type(screen.getByLabelText("Buscar pedido"), "42");

      await waitFor(() => expect(screen.queryByText("#0043", { selector: "td" })).not.toBeInTheDocument());
      expect(screen.getByText("#0042", { selector: "td" })).toBeInTheDocument();
      expect(lastSearch()).toBe("?q=42");
      expect(searches.length - before).toBe(1);
    });

    it("filtra por período com datas locais da academia", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      await user.selectOptions(screen.getByLabelText("Período"), "Esta semana");

      await waitFor(() => expect(lastSearch()).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/));
      const params = new URLSearchParams(lastSearch());
      expect(params.get("from")! <= params.get("to")!).toBe(true);
    });

    it("calcula os períodos a partir de hoje (terça 2026-11-17)", () => {
      expect(periodRange("all", "2026-11-17")).toEqual({ from: "", to: "" });
      expect(periodRange("last30", "2026-11-17")).toEqual({ from: "2026-10-19", to: "2026-11-17" });
      expect(periodRange("week", "2026-11-17")).toEqual({ from: "2026-11-16", to: "2026-11-17" });
    });
  });

  describe("Ações", () => {
    it("só mostra os botões que a transição permite para o status", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });
      await user.selectOptions(screen.getByLabelText("Status"), "Todos os status");
      await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(7));

      const waiting = row("#0043");
      expect(within(waiting).getByRole("button", { name: "Aprovar pedido #0043" })).toBeInTheDocument();
      expect(within(waiting).getByRole("button", { name: "Recusar pedido #0043" })).toBeInTheDocument();
      expect(within(waiting).queryByRole("button", { name: /entregue/ })).not.toBeInTheDocument();

      const approved = row("#0042");
      expect(within(approved).getByRole("button", { name: "Marcar pedido #0042 como entregue" })).toBeInTheDocument();
      expect(within(approved).queryByRole("button", { name: /Aprovar|Recusar/ })).not.toBeInTheDocument();

      for (const number of ["#0031", "#0027", "#0020"]) {
        expect(within(row(number)).queryByRole("button")).not.toBeInTheDocument();
      }
    });

    it("aprova e atualiza a lista e a contagem", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      await user.click(within(row("#0043")).getByRole("button", { name: "Aprovar pedido #0043" }));

      await waitFor(() => expect(screen.queryByText("#0043", { selector: "td" })).not.toBeInTheDocument());
      expect(posts).toEqual([{ path: "o-43/approve", body: undefined }]);
      expect(screen.getByText("#0041", { selector: "td" })).toBeInTheDocument();
    });

    it("recusa com motivo, num diálogo, e fecha ao concluir", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      await user.click(within(row("#0041")).getByRole("button", { name: "Recusar pedido #0041" }));
      const dialog = screen.getByRole("dialog", { name: "Recusar pedido #0041" });
      expect(dialog).toHaveTextContent("As unidades voltam ao estoque");
      await user.type(within(dialog).getByLabelText("Motivo para o cliente (opcional)"), "O boné preto acabou.");
      await user.click(within(dialog).getByRole("button", { name: "Recusar pedido" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(posts).toEqual([{ path: "o-41/reject", body: { reason: "O boné preto acabou." } }]);
      expect(screen.queryByText("#0041", { selector: "td" })).not.toBeInTheDocument();
    });

    it("recusa sem motivo: o motivo é opcional", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      await user.click(within(row("#0043")).getByRole("button", { name: "Recusar pedido #0043" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Recusar pedido" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(posts).toEqual([{ path: "o-43/reject", body: {} }]);
    });

    it("Voltar fecha o diálogo sem recusar", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      await user.click(within(row("#0043")).getByRole("button", { name: "Recusar pedido #0043" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Voltar" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(posts).toEqual([]);
    });

    it("marca como entregue um pedido aprovado", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });
      await user.selectOptions(screen.getByLabelText("Status"), "Aprovado");

      await user.click(
        await screen.findByRole("button", { name: "Marcar pedido #0042 como entregue" }),
      );

      await waitFor(() => expect(screen.queryByText("#0042", { selector: "td" })).not.toBeInTheDocument());
      expect(posts).toEqual([{ path: "o-42/deliver", body: undefined }]);
    });

    it("mostra a mensagem da API quando a transição é inválida e recarrega a lista", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });
      // Outra pessoa aprovou o pedido enquanto a tela estava aberta.
      orders = orders.map((item) => (item.id === "o-43" ? { ...item, status: "APROVADO" } : item));

      await user.click(within(row("#0043")).getByRole("button", { name: "Aprovar pedido #0043" }));

      expect(
        await screen.findByText("Só é possível aprovar ou recusar um pedido que aguarda aprovação."),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText("#0043", { selector: "td" })).not.toBeInTheDocument());
    });

    it("mostra a mensagem da API dentro do diálogo de recusa, que continua aberto", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });
      await user.click(within(row("#0043")).getByRole("button", { name: "Recusar pedido #0043" }));
      orders = orders.map((item) => (item.id === "o-43" ? { ...item, status: "ENTREGUE" } : item));

      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Recusar pedido" }));

      const dialog = screen.getByRole("dialog");
      expect(
        await within(dialog).findByText("Só é possível aprovar ou recusar um pedido que aguarda aprovação."),
      ).toBeInTheDocument();
    });
  });

  describe("Permissão e conexão", () => {
    it("sem Executar, os botões ficam desabilitados com o motivo", async () => {
      mockSuccessfulLogin("Administrador", VIEW_ONLY);
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });

      for (const name of ["Aprovar pedido #0043", "Recusar pedido #0043"]) {
        const button = screen.getByRole("button", { name });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("title", "Você não tem permissão para aprovar, recusar ou entregar pedidos.");
      }
    });

    it("offline, as ações ficam desabilitadas e o diálogo de recusa não confirma", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin");
      await screen.findByRole("table", { name: "Pedidos" });
      await user.click(within(row("#0043")).getByRole("button", { name: "Recusar pedido #0043" }));

      setBrowserOnline(false);

      await waitFor(() =>
        expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Recusar pedido" })).toBeDisabled(),
      );
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Voltar" }));
      expect(screen.getByRole("button", { name: "Aprovar pedido #0043" })).toBeDisabled();
      expect(posts).toEqual([]);
    });
  });

  describe("Dashboard: Pedidos aguardando", () => {
    const dashboard: Dashboard = {
      period: "month",
      from: "2026-11-01",
      to: "2026-11-30",
      today: "2026-11-17",
      occupancy: null,
      activeClients: { total: 42 },
      gamification: null,
    } as Dashboard;

    beforeEach(() => {
      server.use(http.get("/api/dashboard", () => HttpResponse.json(dashboard)));
    });

    it("mostra a contagem e leva à aba Pedidos, para quem tem Ver da Loja", async () => {
      const user = userEvent.setup();
      renderAt("/dashboard");

      const card = (await screen.findByText("Pedidos aguardando", { selector: "dt" })).closest("div")!;
      expect(await within(card).findByText("2")).toBeInTheDocument();

      await user.click(within(card).getByRole("link", { name: /Ver fila/ }));
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/loja-admin$/);
      expect(await screen.findByRole("heading", { level: 1, name: "Pedidos" })).toBeInTheDocument();
    });

    it("não aparece, nem consulta a contagem, sem Ver da Loja", async () => {
      mockSuccessfulLogin("Professor", []);
      let asked = false;
      server.use(
        http.get("/api/shop/admin/orders/pending-count", () => {
          asked = true;
          return HttpResponse.json({ count: 9 });
        }),
      );
      renderAt("/dashboard");

      await screen.findByText("Clientes ativos", { selector: "dt" });
      expect(screen.queryByText("Pedidos aguardando")).not.toBeInTheDocument();
      expect(asked).toBe(false);
    });
  });
});
