import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { CLIENT_ID, camisetaComOpcoes, detail, mockLoja, renderLoja, variant } from "./loja-helpers";
import { server } from "./msw-server";

/**
 * Carrinho e sacola do cabeçalho (L4, #193): contador em qualquer tela do cliente, quantidades, remover, observação
 * e total; o carrinho vive no aparelho (por usuário) e segue funcionando se o armazenamento falhar. O pedido em si é
 * testado em `LojaPedido.test.tsx` (L5).
 */
const CART_KEY = `fitburn:cart:${CLIENT_ID}`;

const CAMISETA = {
  productId: "p-camiseta",
  variantId: "v-preta-m",
  name: "Camiseta Dry Fit",
  variantLabel: "Preta · M",
  unitPriceCents: 6990,
  imageUrl: "/api/shop/product-images/img-1",
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

function seedCart(items = [CAMISETA, GARRAFA], note = "") {
  window.localStorage.setItem(CART_KEY, JSON.stringify({ items, note }));
}
const savedCart = () => JSON.parse(window.localStorage.getItem(CART_KEY) ?? "null");

const GARRAFA_DETAIL = detail({
  id: "p-garrafa",
  name: "Garrafa térmica 750 ml",
  startingPriceCents: 7990,
  variants: [variant("v-edicao", ["Edição Fitburn"], { effectivePriceCents: 7990 })],
  options: [{ id: "o-modelo", name: "Modelo", values: [{ id: "val-ed", value: "Edição Fitburn" }] }],
});

function open(path = "/loja/carrinho", details = [camisetaComOpcoes(), GARRAFA_DETAIL]) {
  mockLoja({ details, products: [] });
  return renderLoja(path);
}

const lineOf = (name: string) => screen.getByRole("listitem", { name });
const total = () => screen.getByText("Total").parentElement as HTMLElement;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("sacola no cabeçalho do cliente", () => {
  it("sem itens, a sacola diz que o carrinho está vazio e não mostra contador", async () => {
    open("/loja");

    const bag = await screen.findByRole("link", { name: "Carrinho vazio" });
    expect(bag).toHaveAttribute("href", "/loja/carrinho");
    expect(bag).not.toHaveTextContent(/\d/);
  });

  it("mostra quantos produtos há no carrinho em qualquer tela do cliente", async () => {
    seedCart();
    open("/loja");

    const bag = await screen.findByRole("link", { name: "Carrinho, 2 itens" });
    expect(bag).toHaveTextContent("2");
  });

  it("um item: fala no singular", async () => {
    seedCart([GARRAFA]);
    open("/loja");

    expect(await screen.findByRole("link", { name: "Carrinho, 1 item" })).toBeInTheDocument();
  });

  it("o contador sobe quando se adiciona um produto, e a sacola leva ao carrinho com o foco no conteúdo", async () => {
    const user = userEvent.setup();
    open("/loja/p-garrafa");
    await screen.findByRole("heading", { level: 1, name: "Garrafa térmica 750 ml" });
    expect(screen.getByRole("link", { name: "Carrinho vazio" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));
    await user.click(await screen.findByRole("link", { name: "Carrinho, 1 item" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Carrinho" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/loja/carrinho");
    await waitFor(() => expect(document.getElementById("conteudo")).toHaveFocus());
  });
});

describe("tela do carrinho", () => {
  it("carrinho vazio: explica e leva de volta à loja", async () => {
    open();

    expect(await screen.findByText("Seu carrinho está vazio.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver a loja" })).toHaveAttribute("href", "/loja");
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("lista os itens com a variação, a quantidade e o preço, e soma o total", async () => {
    seedCart();
    open();

    const camiseta = await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });
    expect(within(camiseta).getByText("Preta · M")).toBeInTheDocument();
    expect(within(camiseta).getByText("R$ 139,80")).toBeInTheDocument();
    expect(within(camiseta).getByRole("status")).toHaveTextContent("2");
    const garrafa = lineOf("Garrafa térmica 750 ml");
    expect(within(garrafa).getByText("Edição Fitburn · 1 por pedido")).toBeInTheDocument();
    // Limite de 1 por pedido: sem controle de quantidade.
    expect(within(garrafa).queryByRole("button", { name: /quantidade/ })).not.toBeInTheDocument();
    expect(within(total()).getByText("R$ 219,70")).toBeInTheDocument();
    expect(screen.getByText(/Pagamento e retirada são feitos na recepção/)).toBeInTheDocument();
  });

  it("muda a quantidade dentro do limite, atualiza preço e total e guarda no aparelho", async () => {
    const user = userEvent.setup();
    seedCart();
    open();
    const camiseta = await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });

    await user.click(within(camiseta).getByRole("button", { name: "Aumentar quantidade de Camiseta Dry Fit" }));

    expect(within(camiseta).getByRole("status")).toHaveTextContent("3");
    expect(within(camiseta).getByText("R$ 209,70")).toBeInTheDocument();
    expect(within(total()).getByText("R$ 289,60")).toBeInTheDocument();
    expect(within(camiseta).getByRole("button", { name: "Aumentar quantidade de Camiseta Dry Fit" })).toBeDisabled();
    await waitFor(() => expect(savedCart().items[0].quantity).toBe(3));

    await user.click(within(camiseta).getByRole("button", { name: "Diminuir quantidade de Camiseta Dry Fit" }));
    await user.click(within(camiseta).getByRole("button", { name: "Diminuir quantidade de Camiseta Dry Fit" }));
    expect(within(camiseta).getByRole("status")).toHaveTextContent("1");
    expect(within(camiseta).getByRole("button", { name: "Diminuir quantidade de Camiseta Dry Fit" })).toBeDisabled();
    expect(within(total()).getByText("R$ 149,80")).toBeInTheDocument();
  });

  it("remove um item, atualiza o total e o contador, e esvazia o carrinho no último", async () => {
    const user = userEvent.setup();
    seedCart();
    open();
    await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });

    await user.click(screen.getByRole("button", { name: "Remover Camiseta Dry Fit" }));

    expect(screen.queryByRole("listitem", { name: "Camiseta Dry Fit" })).not.toBeInTheDocument();
    expect(within(total()).getByText("R$ 79,90")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Carrinho, 1 item" })).toBeInTheDocument();
    await waitFor(() => expect(savedCart().items).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Remover Garrafa térmica 750 ml" }));
    expect(await screen.findByText("Seu carrinho está vazio.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Carrinho vazio" })).toBeInTheDocument();
  });

  it("guarda a observação para a equipe e a recupera ao reabrir", async () => {
    const user = userEvent.setup();
    seedCart();
    const first = open();
    const note = await screen.findByLabelText("Observação para a equipe (opcional)");

    await user.type(note, "Retiro na sexta à noite");
    await waitFor(() => expect(savedCart().note).toBe("Retiro na sexta à noite"));

    first.unmount();
    open();
    expect(await screen.findByLabelText("Observação para a equipe (opcional)")).toHaveValue(
      "Retiro na sexta à noite",
    );
  });

  it("não mostra o carrinho de outro usuário", async () => {
    window.localStorage.setItem("fitburn:cart:outro-usuario", JSON.stringify({ items: [CAMISETA], note: "" }));
    open();

    expect(await screen.findByText("Seu carrinho está vazio.")).toBeInTheDocument();
  });

  it("revalida o preço com a API ao abrir: usa o preço atual no item e no total", async () => {
    seedCart();
    open(
      "/loja/carrinho",
      [
        camisetaComOpcoes({
          variants: [
            variant("v-preta-m", ["Preta", "M"], { effectivePriceCents: 5990 }),
            variant("v-preta-g", ["Preta", "G"]),
            variant("v-branca-m", ["Branca", "M"]),
            variant("v-branca-g", ["Branca", "G"]),
          ],
        }),
        GARRAFA_DETAIL,
      ],
    );

    const camiseta = await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });
    expect(await within(camiseta).findByText("R$ 119,80")).toBeInTheDocument();
    expect(within(total()).getByText("R$ 199,70")).toBeInTheDocument();
  });

  it("sem conexão (a API não responde): mostra o carrinho guardado, sem erro", async () => {
    seedCart();
    mockLoja({});
    server.use(http.get("/api/shop/products/:id", () => HttpResponse.error()));
    renderLoja("/loja/carrinho");

    const camiseta = await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });
    expect(within(camiseta).getByText("R$ 139,80")).toBeInTheDocument();
    expect(within(total()).getByText("R$ 219,70")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("foto do item: usa a foto guardada; sem foto, o espaço da marca", async () => {
    seedCart();
    open();

    const camiseta = await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });
    await waitFor(() => expect(within(camiseta).getByRole("img", { name: "Camiseta Dry Fit" })).toBeInTheDocument());
    expect(within(lineOf("Garrafa térmica 750 ml")).queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("armazenamento do aparelho indisponível", () => {
  it("o carrinho segue funcionando na sessão: adicionar, ver, mudar a quantidade e remover", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    open("/loja/p-camiseta");
    await screen.findByRole("heading", { level: 1, name: "Camiseta Dry Fit" });

    await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));
    await user.click(await screen.findByRole("link", { name: "Ver carrinho" }));

    const camiseta = await screen.findByRole("listitem", { name: "Camiseta Dry Fit" });
    expect(within(camiseta).getByText("Preta · M")).toBeInTheDocument();
    await user.click(within(camiseta).getByRole("button", { name: "Aumentar quantidade de Camiseta Dry Fit" }));
    expect(within(total()).getByText("R$ 139,80")).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Remover Camiseta Dry Fit" }));
    });
    expect(await screen.findByText("Seu carrinho está vazio.")).toBeInTheDocument();
  });
});
