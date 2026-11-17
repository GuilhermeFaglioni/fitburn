import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ShopOrder } from "@fitburn/contracts";
import { setBrowserOnline } from "./connectivity-helpers";
import { mockLoja, renderLoja } from "./loja-helpers";
import { server } from "./msw-server";

/**
 * Meus pedidos (L6, #199): a lista, o detalhe com a linha do tempo (e o motivo da recusa), o cancelamento com
 * confirmação só para pedido aguardando aprovação, e o estado sem conexão.
 */

function event(id: string, toStatus: ShopOrder["status"], createdAt: string, note: string | null = null) {
  return { id, fromStatus: null, toStatus, actorId: "user-x", note, createdAt };
}

function order(overrides: Partial<ShopOrder> = {}): ShopOrder {
  return {
    id: "order-1",
    number: 43,
    status: "AGUARDANDO_APROVACAO",
    observation: "Retiro na sexta",
    totalCents: 21970,
    createdAt: "2026-11-17T15:00:00.000Z",
    items: [
      {
        id: "i-1",
        variantId: "v-preta-m",
        productName: "Camiseta Dry Fit",
        variantLabel: "Preta · M",
        options: [],
        unitPriceCents: 6990,
        quantity: 2,
        subtotalCents: 13980,
      },
      {
        id: "i-2",
        variantId: "v-edicao",
        productName: "Garrafa térmica 750 ml",
        variantLabel: null,
        options: [],
        unitPriceCents: 7990,
        quantity: 1,
        subtotalCents: 7990,
      },
    ],
    events: [event("e-1", "AGUARDANDO_APROVACAO", "2026-11-17T15:00:00.000Z")],
    ...overrides,
  };
}

const PENDENTE = order();
const APROVADO = order({
  id: "order-2",
  number: 42,
  status: "APROVADO",
  createdAt: "2026-11-16T15:00:00.000Z",
  events: [
    event("e-2", "AGUARDANDO_APROVACAO", "2026-11-16T15:00:00.000Z"),
    event("e-3", "APROVADO", "2026-11-16T18:30:00.000Z"),
  ],
});
const RECUSADO = order({
  id: "order-3",
  number: 41,
  status: "RECUSADO",
  createdAt: "2026-11-15T15:00:00.000Z",
  events: [
    event("e-4", "AGUARDANDO_APROVACAO", "2026-11-15T15:00:00.000Z"),
    event("e-5", "RECUSADO", "2026-11-15T19:00:00.000Z", "Produto fora de linha."),
  ],
});

/** Estado "do servidor" dos pedidos, para o cancelamento refletir na lista e no detalhe. */
function mockOrders(initial: ShopOrder[]) {
  const orders = [...initial];
  const cancelled: string[] = [];
  mockLoja();
  server.use(
    http.get("/api/shop/orders", () => HttpResponse.json(orders)),
    http.get("/api/shop/orders/:id", ({ params }) => {
      const found = orders.find((item) => item.id === params.id);
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado." }, { status: 404 });
    }),
    http.post("/api/shop/orders/:id/cancel", ({ params }) => {
      const index = orders.findIndex((item) => item.id === params.id);
      const current = orders[index]!;
      if (current.status !== "AGUARDANDO_APROVACAO") {
        return HttpResponse.json(
          { code: "ORDER_INVALID_STATUS", message: "O pedido já foi aprovado e não pode mais ser cancelado." },
          { status: 409 },
        );
      }
      cancelled.push(current.id);
      orders[index] = {
        ...current,
        status: "CANCELADO",
        events: [...current.events, event("e-cancel", "CANCELADO", "2026-11-17T16:00:00.000Z")],
      };
      return HttpResponse.json(orders[index]);
    }),
  );
  return { orders, cancelled };
}

describe("lista Meus pedidos", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("mostra número, status, data e total de cada pedido, e abre o detalhe", async () => {
    const user = userEvent.setup();
    mockOrders([PENDENTE, APROVADO, RECUSADO]);
    renderLoja("/pedidos");

    expect(await screen.findByRole("heading", { level: 1, name: "Meus pedidos" })).toBeInTheDocument();
    const pendente = await screen.findByRole("link", { name: "Pedido #0043, Aguardando aprovação" });
    expect(within(pendente).getByText("17/11/2026 · 3 itens")).toBeInTheDocument();
    expect(within(pendente).getByText("R$ 219,70")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedido #0042, Aprovado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedido #0041, Recusado" })).toBeInTheDocument();

    await user.click(pendente);

    expect(await screen.findByRole("heading", { level: 1, name: "Pedido #0043" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/pedidos/order-1");
  });

  it("sem pedidos: estado vazio com atalho para a loja", async () => {
    mockOrders([]);
    renderLoja("/pedidos");

    expect(await screen.findByText("Você ainda não fez nenhum pedido.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver a loja" })).toHaveAttribute("href", "/loja");
  });

  it("falha da API: mostra o erro com 'Tentar novamente'", async () => {
    mockLoja();
    server.use(
      http.get("/api/shop/orders", () => HttpResponse.json({ code: "INTERNAL_ERROR", message: "x" }, { status: 500 })),
    );
    renderLoja("/pedidos");

    expect(await screen.findByText("Não foi possível carregar seus pedidos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("sem conexão e sem dado: mostra o estado offline (não um erro) e carrega quando a conexão volta", async () => {
    mockOrders([PENDENTE]);
    onlineManager.setOnline(false);
    renderLoja("/pedidos");

    const offline = await waitFor(() => {
      const found = document.querySelector('[data-state="offline"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
    expect(offline).toHaveTextContent("Não foi possível carregar seus pedidos.");
    expect(within(offline).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    onlineManager.setOnline(true);

    expect(await screen.findByRole("link", { name: "Pedido #0043, Aguardando aprovação" })).toBeInTheDocument();
  });
});

describe("detalhe do pedido", () => {
  it("mostra itens, total, observação e a linha do tempo", async () => {
    mockOrders([APROVADO]);
    renderLoja("/pedidos/order-2");

    expect(await screen.findByRole("heading", { level: 1, name: "Pedido #0042" })).toBeInTheDocument();
    expect(screen.getByText("Aprovado", { selector: ".fb-ui-badge" })).toBeInTheDocument();
    const items = screen.getByRole("region", { name: "Itens" });
    expect(within(items).getByText("Camiseta Dry Fit")).toBeInTheDocument();
    expect(within(items).getByText("Preta · M")).toBeInTheDocument();
    expect(within(items).getByText("2 × R$ 69,90")).toBeInTheDocument();
    expect(within(items).getByText("R$ 139,80")).toBeInTheDocument();
    expect(within(items).getByText("R$ 219,70")).toBeInTheDocument();
    expect(within(items).getByText("Sua observação: Retiro na sexta")).toBeInTheDocument();

    const timeline = screen.getByRole("region", { name: "Acompanhamento" });
    const steps = within(timeline).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(within(steps[0]!).getByText("Pedido feito")).toBeInTheDocument();
    expect(within(steps[1]!).getByText("Aprovado")).toBeInTheDocument();
    expect(within(steps[1]!).getByText("16/11/2026 às 15h30")).toBeInTheDocument();
    expect(screen.getByText(/Retire na recepção/)).toBeInTheDocument();
  });

  it("pedido recusado: mostra a nota do evento como motivo e não oferece cancelar", async () => {
    mockOrders([RECUSADO]);
    renderLoja("/pedidos/order-3");

    expect(await screen.findByText("Motivo: Produto fora de linha.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
  });

  it.each([["APROVADO", APROVADO], ["ENTREGUE", order({ id: "order-4", status: "ENTREGUE" })]] as const)(
    "pedido %s: não oferece cancelar",
    async (_status, found) => {
      mockOrders([found]);
      renderLoja(`/pedidos/${found.id}`);

      await screen.findByRole("heading", { level: 1, name: `Pedido #00${found.number}` });
      expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
    },
  );

  it("pedido inexistente: avisa que não foi encontrado", async () => {
    mockOrders([PENDENTE]);
    renderLoja("/pedidos/nao-existe");

    expect(await screen.findByText("Pedido não encontrado.")).toBeInTheDocument();
  });
});

describe("cancelar pedido", () => {
  it("pede confirmação, cancela e atualiza o detalhe e a lista", async () => {
    const user = userEvent.setup();
    const { cancelled } = mockOrders([PENDENTE]);
    renderLoja("/pedidos/order-1");

    await user.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar o pedido #0043?" });
    expect(cancelled).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar pedido" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cancelled).toEqual(["order-1"]);
    expect(await screen.findByText("Cancelado", { selector: ".fb-ui-badge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Acompanhamento" })).getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("link", { name: "Voltar para Meus pedidos" }));
    expect(await screen.findByRole("link", { name: "Pedido #0043, Cancelado" })).toBeInTheDocument();
  });

  it("'Manter pedido' fecha sem cancelar", async () => {
    const user = userEvent.setup();
    const { cancelled } = mockOrders([PENDENTE]);
    renderLoja("/pedidos/order-1");

    await user.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Manter pedido" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cancelled).toEqual([]);
    expect(screen.getByText("Aguardando aprovação", { selector: ".fb-ui-badge" })).toBeInTheDocument();
  });

  it("a API recusa (já aprovado): a mensagem aparece no diálogo, que continua aberto", async () => {
    const user = userEvent.setup();
    const { orders } = mockOrders([PENDENTE]);
    renderLoja("/pedidos/order-1");
    await user.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    // A academia aprovou enquanto o diálogo estava aberto.
    orders[0] = { ...PENDENTE, status: "APROVADO" };

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar pedido" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "O pedido já foi aprovado e não pode mais ser cancelado.",
    );
  });
});

describe("sem conexão", () => {
  afterEach(() => setBrowserOnline(true));

  it("Cancelar pedido fica desabilitado, com o motivo, e volta quando a conexão volta", async () => {
    const user = userEvent.setup();
    const { cancelled } = mockOrders([PENDENTE]);
    renderLoja("/pedidos/order-1");
    const button = await screen.findByRole("button", { name: "Cancelar pedido" });

    setBrowserOnline(false);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("title", expect.stringMatching(/sem conexão/));
    expect(screen.getByText("Conecte-se para cancelar o pedido.")).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cancelled).toEqual([]);

    setBrowserOnline(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeEnabled());
  });

  it("a confirmação também fica desabilitada se a conexão cair com o diálogo aberto", async () => {
    const user = userEvent.setup();
    mockOrders([PENDENTE]);
    renderLoja("/pedidos/order-1");
    await user.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    const dialog = await screen.findByRole("dialog");

    setBrowserOnline(false);

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Cancelar pedido" })).toBeDisabled(),
    );
  });
});
