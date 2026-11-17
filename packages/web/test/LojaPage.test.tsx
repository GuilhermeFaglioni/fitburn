import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setBrowserOnline } from "./connectivity-helpers";
import { image, mockLoja, product, renderLoja } from "./loja-helpers";
import { server } from "./msw-server";

/**
 * Catálogo do cliente (L4, #193): grade com foto, nome e preço; filtro por categoria; selo PROMO; "a partir de";
 * Esgotado; e os estados vazio, carregando, erro e sem conexão.
 */
const CATEGORIES = [
  { id: "c-vestuario", name: "Vestuário", position: 0 },
  { id: "c-garrafas", name: "Garrafas", position: 1 },
];

const PRODUCTS = [
  product({
    id: "p-camiseta",
    name: "Camiseta Dry Fit",
    category: { id: "c-vestuario", name: "Vestuário" },
    startingPriceCents: 6990,
    originalPriceCents: 8990,
    coverImage: image("img-camiseta"),
  }),
  product({
    id: "p-garrafa",
    name: "Garrafa térmica 750 ml",
    category: { id: "c-garrafas", name: "Garrafas" },
    startingPriceCents: 7990,
  }),
  product({
    id: "p-bone",
    name: "Boné Fitburn",
    category: { id: "c-vestuario", name: "Vestuário" },
    startingPriceCents: 5990,
    hasPriceVariation: true,
  }),
  product({
    id: "p-toalha",
    name: "Toalha de treino",
    category: null,
    startingPriceCents: 3990,
    availability: "ESGOTADO",
  }),
];

/** O cartão do produto: o link que traz o nome. */
const card = (name: string) => screen.getByRole("link", { name: new RegExp(name) });

describe("catálogo da loja (cliente)", () => {
  it("mostra a grade com nome e preço, e cada produto leva ao detalhe", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    renderLoja("/loja");

    expect(await screen.findByRole("heading", { level: 1, name: "Loja Fitburn" })).toBeInTheDocument();
    const garrafa = await screen.findByRole("link", { name: /Garrafa térmica 750 ml/ });
    expect(garrafa).toHaveAttribute("href", "/loja/p-garrafa");
    expect(within(garrafa).getByText("R$ 79,90")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /R\$/ })).toHaveLength(4);
  });

  it("carrega a foto de capa pela API com o token e usa o nome do produto como texto alternativo", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    renderLoja("/loja");

    const photo = await screen.findByRole("img", { name: "Camiseta Dry Fit" });
    await waitFor(() => expect(photo.getAttribute("src")).toMatch(/^blob:/));
    // Sem foto, o espaço mostra um desenho de sacola e não uma imagem.
    expect(within(card("Garrafa")).queryByRole("img")).not.toBeInTheDocument();
  });

  it("mostra o selo PROMO com o preço cheio riscado quando há promoção", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    renderLoja("/loja");

    await screen.findByRole("link", { name: /Camiseta/ });
    const camiseta = card("Camiseta");
    expect(within(camiseta).getByText("PROMO")).toBeInTheDocument();
    expect(within(camiseta).getByText("R$ 89,90").tagName).toBe("S");
    expect(within(camiseta).getByText("R$ 69,90")).toBeInTheDocument();
    expect(within(card("Garrafa")).queryByText("PROMO")).not.toBeInTheDocument();
  });

  it("mostra “a partir de” quando as variações têm preços diferentes", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    renderLoja("/loja");

    await screen.findByRole("link", { name: /Boné/ });
    expect(within(card("Boné")).getByText(/a partir de/)).toHaveTextContent("a partir de R$ 59,90");
    expect(within(card("Garrafa")).queryByText(/a partir de/)).not.toBeInTheDocument();
  });

  it("marca como Esgotado o produto sem estoque em nenhuma variação", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    renderLoja("/loja");

    await screen.findByRole("link", { name: /Toalha/ });
    expect(within(card("Toalha")).getByText("ESGOTADO")).toBeInTheDocument();
    expect(within(card("Garrafa")).queryByText("ESGOTADO")).not.toBeInTheDocument();
  });

  it("filtra por categoria, mantém o filtro na URL e volta a Tudo", async () => {
    const user = userEvent.setup();
    const requests: Array<string | null> = [];
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    server.use(
      http.get("/api/shop/products", ({ request }) => {
        const categoryId = new URL(request.url).searchParams.get("categoryId");
        requests.push(categoryId);
        return HttpResponse.json(
          categoryId ? PRODUCTS.filter((item) => item.category?.id === categoryId) : PRODUCTS,
        );
      }),
    );
    renderLoja("/loja");

    const filter = await screen.findByRole("group", { name: "Categorias" });
    expect(within(filter).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Tudo",
      "Vestuário",
      "Garrafas",
    ]);
    expect(within(filter).getByRole("button", { name: "Tudo" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(filter).getByRole("button", { name: "Vestuário" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: /Garrafa/ })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Camiseta/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Boné/ })).toBeInTheDocument();
    expect(within(filter).getByRole("button", { name: "Vestuário" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("/loja?categoria=c-vestuario");
    expect(requests).toContain("c-vestuario");

    await user.click(within(filter).getByRole("button", { name: "Tudo" }));
    expect(await screen.findByRole("link", { name: /Garrafa/ })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/loja$/);
  });

  it("abre já filtrado quando a URL traz a categoria", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    renderLoja("/loja?categoria=c-garrafas");

    expect(await screen.findByRole("link", { name: /Garrafa/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Camiseta/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Garrafas" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sem produtos à venda: estado vazio", async () => {
    mockLoja({ products: [], categories: [] });
    renderLoja("/loja");

    expect(await screen.findByText("Ainda não há produtos à venda. Volte em breve.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Categorias" })).not.toBeInTheDocument();
  });

  it("categoria sem produtos: avisa e deixa voltar a Tudo", async () => {
    mockLoja({ products: [], categories: CATEGORIES });
    renderLoja("/loja?categoria=c-garrafas");

    expect(await screen.findByText("Nenhum produto nesta categoria.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver todos os produtos" })).toBeInTheDocument();
  });

  it("enquanto carrega, mostra o estado de carregamento", async () => {
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    server.use(
      http.get("/api/shop/products", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json(PRODUCTS);
      }),
    );
    renderLoja("/loja");

    expect(await screen.findByText("Carregando os produtos…")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Garrafa/ })).toBeInTheDocument();
  });

  it("se a API falha, mostra o erro e tenta de novo", async () => {
    const user = userEvent.setup();
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    let calls = 0;
    server.use(
      http.get("/api/shop/products", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Falhou." }, { status: 500 })
          : HttpResponse.json(PRODUCTS);
      }),
    );
    renderLoja("/loja");

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a loja.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: /Garrafa/ })).toBeInTheDocument();
  });

  it("sem conexão e sem nada carregado: mostra o estado de sem conexão, e a rede de volta recarrega", async () => {
    const user = userEvent.setup();
    mockLoja({ products: PRODUCTS, categories: CATEGORIES });
    let down = true;
    server.use(
      http.get("/api/shop/products", () => (down ? HttpResponse.error() : HttpResponse.json(PRODUCTS))),
      // Rede fora do ar: as categorias também falham (uma resposta boa derrubaria o aviso de rede).
      http.get("/api/shop/categories", () => HttpResponse.error()),
    );
    renderLoja("/loja");

    expect(await screen.findByText("Sem conexão")).toBeInTheDocument();
    expect(screen.getByText("Não foi possível carregar a loja.")).toBeInTheDocument();

    down = false;
    act(() => setBrowserOnline(true));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: /Garrafa/ })).toBeInTheDocument();
  });
});
