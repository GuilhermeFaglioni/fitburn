import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ShopOrder } from "@fitburn/contracts";
import { CLIENT_ID, camisetaComOpcoes, detail, mockLoja, renderLoja, variant } from "./loja-helpers";
import { server } from "./msw-server";

/**
 * Fazer pedido (L5, #196): o carrinho envia o pedido com uma chave de idempotência por tentativa de compra, mostra
 * "Pedido feito" com o número, ajusta o carrinho (sem limpar) quando o estoque mudou e fica indisponível offline.
 */
const CART_KEY = `fitburn:cart:${CLIENT_ID}`;

const CAMISETA = {
  productId: "p-camiseta",
  variantId: "v-preta-m",
  name: "Camiseta Dry Fit",
  variantLabel: "Preta · M",
  unitPriceCents: 6990,
  imageUrl: null,
  maxQuantity: 3,
  quantity: 2,
};
const GARRAFA = {
  productId: "p-garrafa",
  variantId: "v-edicao",
  name: "Garrafa térmica 750 ml",
  variantLabel: "Edição Fitburn",
  unitPriceCents: 7990,
  imageUrl: null,
  maxQuantity: 1,
  quantity: 1,
};
const GARRAFA_DETAIL = detail({
  id: "p-garrafa",
  name: "Garrafa térmica 750 ml",
  startingPriceCents: 7990,
  variants: [variant("v-edicao", ["Edição Fitburn"], { effectivePriceCents: 7990 })],
  options: [{ id: "o-modelo", name: "Modelo", values: [{ id: "val-ed", value: "Edição Fitburn" }] }],
});

function seedCart(items = [CAMISETA, GARRAFA], note = "") {
  window.localStorage.setItem(CART_KEY, JSON.stringify({ items, note }));
}
const savedCart = () => JSON.parse(window.localStorage.getItem(CART_KEY) ?? "null");

function order(overrides: Partial<ShopOrder> = {}): ShopOrder {
  return {
    id: "order-1",
    number: 1,
    status: "AGUARDANDO_APROVACAO",
    observation: null,
    totalCents: 21970,
    createdAt: "2026-11-17T12:00:00.000Z",
    items: [],
    events: [],
    ...overrides,
  };
}

interface SentOrder {
  key: string | null;
  body: { items: Array<{ variantId: string; quantity: number }>; observation?: string | null };
}

/** Responde ao POST de pedidos com `reply` e guarda o que foi enviado (chave e corpo). */
function mockOrders(reply: (sent: SentOrder, attempt: number) => Response) {
  const sent: SentOrder[] = [];
  server.use(
    http.post("/api/shop/orders", async ({ request }) => {
      const entry: SentOrder = {
        key: request.headers.get("Idempotency-Key"),
        body: (await request.json()) as SentOrder["body"],
      };
      sent.push(entry);
      return reply(entry, sent.length);
    }),
  );
  return sent;
}

function open() {
  mockLoja({ details: [camisetaComOpcoes(), GARRAFA_DETAIL], products: [] });
  return renderLoja("/loja/carrinho");
}

const placeOrder = () => screen.findByRole("button", { name: "Fazer pedido" });

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("fazer pedido", () => {
  it("envia os itens e a observação com uma chave de idempotência (UUID)", async () => {
    const user = userEvent.setup();
    seedCart([CAMISETA, GARRAFA], "Retiro na sexta");
    const sent = mockOrders(() => HttpResponse.json(order(), { status: 201 }));
    open();

    await user.click(await placeOrder());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(sent[0]!.body).toEqual({
      items: [
        { variantId: "v-preta-m", quantity: 2 },
        { variantId: "v-edicao", quantity: 1 },
      ],
      observation: "Retiro na sexta",
    });
  });

  it("sucesso: mostra Pedido feito com o número, o status, o aviso da recepção e limpa o carrinho", async () => {
    const user = userEvent.setup();
    seedCart();
    mockOrders(() => HttpResponse.json(order({ number: 1 }), { status: 201 }));
    open();

    await user.click(await placeOrder());

    expect(await screen.findByRole("heading", { level: 1, name: "Pedido #0001 feito" })).toBeInTheDocument();
    expect(screen.getByText("Aguardando aprovação")).toBeInTheDocument();
    expect(screen.getByText(/Pagamento e retirada na recepção/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar à loja" })).toHaveAttribute("href", "/loja");
    expect(screen.queryByRole("button", { name: "Fazer pedido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Camiseta Dry Fit" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Carrinho vazio" })).toBeInTheDocument();
    await waitFor(() => expect(savedCart()).toEqual({ items: [], note: "" }));
  });

  it("enquanto envia, o botão fica ocupado e um segundo toque não envia de novo", async () => {
    const user = userEvent.setup();
    seedCart();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const sent = mockOrders(async () => {
      await gate;
      return HttpResponse.json(order(), { status: 201 });
    });
    open();
    const button = await placeOrder();

    await user.click(button);
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    release();
    await screen.findByRole("heading", { level: 1, name: "Pedido #0001 feito" });
    expect(sent).toHaveLength(1);
  });
});
