import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ShopOrder } from "@fitburn/contracts";
import { setBrowserOnline } from "./connectivity-helpers";
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
function mockOrders(reply: (sent: SentOrder, attempt: number) => Response | Promise<Response>) {
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

describe("repetição e rede instável", () => {
  afterEach(() => setBrowserOnline(true));

  it("a rede cai no envio: o carrinho fica, e a nova tentativa reenvia a mesma chave", async () => {
    const user = userEvent.setup();
    seedCart();
    const sent = mockOrders((_, attempt) =>
      attempt === 1 ? HttpResponse.error() : HttpResponse.json(order({ number: 7 }), { status: 201 }),
    );
    open();

    await user.click(await placeOrder());

    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível enviar o pedido/);
    expect(screen.getByRole("listitem", { name: "Camiseta Dry Fit" })).toBeInTheDocument();
    expect(savedCart().items).toHaveLength(2);
    // A falha de rede põe o app em "sem conexão"; ao voltar a rede, a pessoa tenta de novo.
    expect(screen.getByRole("button", { name: "Fazer pedido" })).toBeDisabled();
    setBrowserOnline(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fazer pedido" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Fazer pedido" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Pedido #0007 feito" })).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.key).toBe(sent[0]!.key);
  });

  it("mudar o carrinho entre as tentativas é outro pedido: usa uma chave nova", async () => {
    const user = userEvent.setup();
    seedCart();
    const sent = mockOrders((_, attempt) =>
      attempt === 1 ? HttpResponse.error() : HttpResponse.json(order(), { status: 201 }),
    );
    open();
    await user.click(await placeOrder());
    await screen.findByRole("alert");
    setBrowserOnline(true);

    await user.click(screen.getByRole("button", { name: "Remover Garrafa térmica 750 ml" }));
    await user.click(screen.getByRole("button", { name: "Fazer pedido" }));

    await screen.findByRole("heading", { level: 1, name: "Pedido #0001 feito" });
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
    expect(sent[1]!.body.items).toEqual([{ variantId: "v-preta-m", quantity: 2 }]);
  });

  it("recusa da API (não é conflito): mostra a mensagem, mantém o carrinho e a próxima tentativa usa chave nova", async () => {
    const user = userEvent.setup();
    seedCart();
    const sent = mockOrders((_, attempt) =>
      attempt === 1
        ? HttpResponse.json(
            { code: "PRODUCT_NOT_AVAILABLE", message: "Um ou mais produtos não estão mais disponíveis." },
            { status: 409 },
          )
        : HttpResponse.json(order(), { status: 201 }),
    );
    open();

    await user.click(await placeOrder());
    expect(await screen.findByRole("alert")).toHaveTextContent("Um ou mais produtos não estão mais disponíveis.");
    expect(screen.getByRole("listitem", { name: "Camiseta Dry Fit" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fazer pedido" }));
    await screen.findByRole("heading", { level: 1, name: "Pedido #0001 feito" });
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
  });
});

describe("estoque mudou (409 SHOP_STOCK_CONFLICT)", () => {
  const conflict = (items: Array<{ variantId: string; requestedQuantity: number; availableQuantity: number }>) =>
    HttpResponse.json(
      { code: "SHOP_STOCK_CONFLICT", message: "O estoque mudou. Ajuste as quantidades do carrinho.", details: { items } },
      { status: 409 },
    );

  it("não limpa o carrinho: ajusta a quantidade para o disponível, avisa quais itens mudaram e guarda o ajuste", async () => {
    const user = userEvent.setup();
    seedCart();
    mockOrders(() =>
      conflict([
        { variantId: "v-preta-m", requestedQuantity: 2, availableQuantity: 1 },
        { variantId: "v-edicao", requestedQuantity: 1, availableQuantity: 1 },
      ]),
    );
    open();

    await user.click(await placeOrder());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Restou só 1 unidade de Camiseta Dry Fit · Preta · M.");
    expect(alert).toHaveTextContent("Ajustamos o carrinho; confira e faça o pedido de novo.");
    expect(alert).not.toHaveTextContent("Garrafa");
    const camiseta = screen.getByRole("listitem", { name: "Camiseta Dry Fit" });
    expect(within(camiseta).getByRole("status")).toHaveTextContent("1");
    expect(within(camiseta).getByText("R$ 69,90")).toBeInTheDocument();
    expect(camiseta).toHaveAttribute("data-adjusted");
    expect(screen.getByRole("listitem", { name: "Garrafa térmica 750 ml" })).not.toHaveAttribute("data-adjusted");
    expect(within(screen.getByText("Total").parentElement as HTMLElement).getByText("R$ 149,80")).toBeInTheDocument();
    await waitFor(() => expect(savedCart().items.map((item: { quantity: number }) => item.quantity)).toEqual([1, 1]));
    expect(screen.getByRole("button", { name: "Fazer pedido" })).toBeEnabled();
  });

  it("item esgotado (disponível 0) sai do carrinho com aviso; os demais ficam", async () => {
    const user = userEvent.setup();
    seedCart();
    mockOrders(() => conflict([{ variantId: "v-edicao", requestedQuantity: 1, availableQuantity: 0 }]));
    open();

    await user.click(await placeOrder());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Garrafa térmica 750 ml · Edição Fitburn esgotou e saiu do carrinho.",
    );
    expect(screen.queryByRole("listitem", { name: "Garrafa térmica 750 ml" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Camiseta Dry Fit" })).toBeInTheDocument();
    await waitFor(() => expect(savedCart().items).toHaveLength(1));
  });

  it("confirmar de novo envia as quantidades ajustadas com uma chave nova e conclui o pedido", async () => {
    const user = userEvent.setup();
    seedCart();
    const sent = mockOrders((_, attempt) =>
      attempt === 1
        ? conflict([{ variantId: "v-preta-m", requestedQuantity: 2, availableQuantity: 1 }])
        : HttpResponse.json(order({ number: 3 }), { status: 201 }),
    );
    open();
    await user.click(await placeOrder());
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Fazer pedido" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Pedido #0003 feito" })).toBeInTheDocument();
    expect(sent[1]!.body.items).toEqual([
      { variantId: "v-preta-m", quantity: 1 },
      { variantId: "v-edicao", quantity: 1 },
    ]);
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
    await waitFor(() => expect(savedCart().items).toEqual([]));
  });

  it("todos os itens esgotados: o carrinho fica vazio, mas o aviso continua na tela", async () => {
    const user = userEvent.setup();
    seedCart([GARRAFA]);
    mockOrders(() => conflict([{ variantId: "v-edicao", requestedQuantity: 1, availableQuantity: 0 }]));
    open();

    await user.click(await placeOrder());

    expect(await screen.findByText("Seu carrinho está vazio.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("esgotou e saiu do carrinho");
  });
});

describe("sem conexão", () => {
  afterEach(() => setBrowserOnline(true));

  it("Fazer pedido fica desabilitado, com o motivo, e não some; o carrinho segue utilizável", async () => {
    const user = userEvent.setup();
    seedCart();
    const sent = mockOrders(() => HttpResponse.json(order(), { status: 201 }));
    setBrowserOnline(false);
    open();

    const button = await placeOrder();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/sem conexão/));
    expect(screen.getByText("Conecte-se para fazer o pedido.")).toBeInTheDocument();
    await user.click(button);
    expect(sent).toHaveLength(0);

    const camiseta = screen.getByRole("listitem", { name: "Camiseta Dry Fit" });
    await user.click(within(camiseta).getByRole("button", { name: "Aumentar quantidade de Camiseta Dry Fit" }));
    expect(within(camiseta).getByRole("status")).toHaveTextContent("3");
    await user.click(screen.getByRole("button", { name: "Remover Garrafa térmica 750 ml" }));
    expect(screen.queryByRole("listitem", { name: "Garrafa térmica 750 ml" })).not.toBeInTheDocument();
  });

  it("volta a conexão: o botão reabilita", async () => {
    seedCart();
    setBrowserOnline(false);
    open();
    expect(await placeOrder()).toBeDisabled();

    setBrowserOnline(true);

    await waitFor(() => expect(screen.getByRole("button", { name: "Fazer pedido" })).toBeEnabled());
    expect(screen.queryByText("Conecte-se para fazer o pedido.")).not.toBeInTheDocument();
  });
});
