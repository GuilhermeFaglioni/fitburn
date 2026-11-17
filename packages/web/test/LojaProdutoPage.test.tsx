import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { CLIENT_ID, camisetaComOpcoes, detail, mockLoja, renderLoja, variant } from "./loja-helpers";
import { server } from "./msw-server";

/**
 * Detalhe do produto (L4, #193): galeria com todas as fotos, opções, combinação sem estoque riscada, aviso de poucas
 * unidades, quantidade conforme as regras do produto e "Adicionar ao carrinho".
 */
const CART_KEY = `fitburn:cart:${CLIENT_ID}`;
const savedCart = () => JSON.parse(window.localStorage.getItem(CART_KEY) ?? "null");

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

async function open(product = camisetaComOpcoes()) {
  mockLoja({ details: [product] });
  renderLoja(`/loja/${product.id}`);
  return screen.findByRole("heading", { level: 1, name: product.name });
}

const value = (name: string | RegExp) => screen.getByRole("button", { name });

describe("detalhe do produto (cliente)", () => {
  it("mostra a categoria, o nome, a descrição e todas as fotos, lidas pela API com o token", async () => {
    const authorizations: string[] = [];
    mockLoja({ details: [camisetaComOpcoes()] });
    server.use(
      http.get("/api/shop/product-images/:id", ({ request }) => {
        authorizations.push(request.headers.get("Authorization") ?? "");
        return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } });
      }),
    );
    renderLoja("/loja/p-camiseta");

    expect(await screen.findByRole("heading", { level: 1, name: "Camiseta Dry Fit" })).toBeInTheDocument();
    expect(screen.getByText("Vestuário")).toBeInTheDocument();
    expect(screen.getByText("Tecido leve com secagem rápida.")).toBeInTheDocument();
    const gallery = screen.getByRole("region", { name: "Fotos do produto" });
    await waitFor(() => expect(within(gallery).getAllByRole("img")).toHaveLength(3));
    expect(within(gallery).getAllByRole("img").map((photo) => photo.getAttribute("alt"))).toEqual([
      "Foto 1 de 3",
      "Foto 2 de 3",
      "Foto 3 de 3",
    ]);
    expect(authorizations.every((header) => header.startsWith("Bearer "))).toBe(true);
    expect(within(gallery).getByRole("button", { name: "Ver foto 2 de 3" })).toBeInTheDocument();
  });

  it("sem foto, mostra o espaço da marca e não uma imagem", async () => {
    await open(camisetaComOpcoes({ images: [] }));

    expect(screen.queryByRole("region", { name: "Fotos do produto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("começa na primeira combinação com estoque e mostra o preço promocional com o cheio riscado", async () => {
    await open(camisetaComOpcoes({ variants: [
      variant("v-preta-m", ["Preta", "M"], { availability: "ESGOTADO" }),
      variant("v-preta-g", ["Preta", "G"]),
      variant("v-branca-m", ["Branca", "M"]),
      variant("v-branca-g", ["Branca", "G"]),
    ] }));

    expect(value("Preta")).toHaveAttribute("aria-pressed", "true");
    expect(value("G")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("R$ 89,90").tagName).toBe("S");
    expect(screen.getByText("R$ 69,90")).toBeInTheDocument();
  });

  it("combinação sem estoque aparece riscada e desabilitada, com o motivo no nome", async () => {
    await open();

    // Preta · M está escolhida; Preta · G está esgotada.
    const g = screen.getByRole("button", { name: "G, esgotado" });
    expect(g).toBeDisabled();
    expect(g).toHaveClass("fb-loja-value");
    expect(value("M")).toHaveAttribute("aria-pressed", "true");
    expect(value("Branca")).toBeEnabled();
  });

  it("trocar de cor reavalia o que está esgotado para a nova combinação", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(value("Branca"));

    expect(value("Branca")).toHaveAttribute("aria-pressed", "true");
    expect(value("G")).toBeEnabled();
    await user.click(value("G"));
    expect(value("G")).toHaveAttribute("aria-pressed", "true");
    // Voltar a Preta com G escolhido: Preta · G está esgotada, então Preta fica desabilitada.
    expect(screen.getByRole("button", { name: "Preta, esgotado" })).toBeDisabled();
  });

  it("avisa quando restam poucas unidades da combinação escolhida", async () => {
    const user = userEvent.setup();
    await open();

    expect(screen.getByText("Restam poucas unidades de Preta · M.")).toBeInTheDocument();

    await user.click(value("Branca"));
    expect(screen.queryByText(/Restam poucas unidades/)).not.toBeInTheDocument();
  });

  it("o preço acompanha a variação escolhida quando os preços diferem", async () => {
    const user = userEvent.setup();
    await open(
      camisetaComOpcoes({
        originalPriceCents: null,
        hasPriceVariation: true,
        startingPriceCents: 6990,
        variants: [
          variant("v-preta-m", ["Preta", "M"], { effectivePriceCents: 6990 }),
          variant("v-preta-g", ["Preta", "G"], { effectivePriceCents: 7990 }),
          variant("v-branca-m", ["Branca", "M"], { effectivePriceCents: 6990 }),
          variant("v-branca-g", ["Branca", "G"], { effectivePriceCents: 7990 }),
        ],
      }),
    );

    expect(screen.getByText("R$ 69,90")).toBeInTheDocument();
    await user.click(value("G"));
    expect(screen.getByText("R$ 79,90")).toBeInTheDocument();
    expect(screen.queryByText("R$ 69,90")).not.toBeInTheDocument();
  });

  describe("quantidade", () => {
    it("mostra o controle com o limite por pedido quando o produto permite mais de uma unidade", async () => {
      const user = userEvent.setup();
      await open();

      expect(screen.getByText("até 3 por pedido")).toBeInTheDocument();
      const quantity = screen.getByRole("group", { name: /Quantidade/ });
      expect(within(quantity).getByRole("status")).toHaveTextContent("1");
      expect(within(quantity).getByRole("button", { name: "Diminuir" })).toBeDisabled();

      await user.click(within(quantity).getByRole("button", { name: "Aumentar" }));
      await user.click(within(quantity).getByRole("button", { name: "Aumentar" }));
      expect(within(quantity).getByRole("status")).toHaveTextContent("3");
      expect(within(quantity).getByRole("button", { name: "Aumentar" })).toBeDisabled();
    });

    it("sem limite, deixa aumentar sem teto", async () => {
      const user = userEvent.setup();
      await open(camisetaComOpcoes({ limitePorPedido: null }));

      const quantity = screen.getByRole("group", { name: /Quantidade/ });
      expect(within(quantity).queryByText(/por pedido/)).not.toBeInTheDocument();
      for (let i = 0; i < 4; i++) {
        await user.click(within(quantity).getByRole("button", { name: "Aumentar" }));
      }
      expect(within(quantity).getByRole("status")).toHaveTextContent("5");
    });

    it("produto limitado a uma unidade por pedido: a quantidade nem aparece", async () => {
      await open(camisetaComOpcoes({ permiteMaisDeUmaUnidade: false, limitePorPedido: null }));

      expect(screen.queryByRole("group", { name: /Quantidade/ })).not.toBeInTheDocument();
      expect(screen.getByText("Limite de 1 unidade por pedido.")).toBeInTheDocument();
    });
  });

  describe("adicionar ao carrinho", () => {
    it("adiciona a combinação e a quantidade, atualiza o carrinho e avisa com o atalho para vê-lo", async () => {
      const user = userEvent.setup();
      await open();
      await user.click(value("Branca"));
      await user.click(screen.getByRole("button", { name: "Aumentar" }));

      await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));

      const notice = (await screen.findByText(/Adicionado ao carrinho\./)).closest(".fb-ui-alert") as HTMLElement;
      expect(notice).toHaveAttribute("role", "status");
      expect(within(notice).getByRole("link", { name: "Ver carrinho" })).toHaveAttribute("href", "/loja/carrinho");
      await waitFor(() => expect(savedCart().items).toHaveLength(1));
      expect(savedCart().items[0]).toMatchObject({
        productId: "p-camiseta",
        variantId: "v-branca-m",
        name: "Camiseta Dry Fit",
        variantLabel: "Branca · M",
        unitPriceCents: 6990,
        quantity: 2,
        maxQuantity: 3,
        imageUrl: "/api/shop/product-images/img-1",
      });
    });

    it("o botão mostra o total da quantidade escolhida", async () => {
      const user = userEvent.setup();
      await open();

      expect(screen.getByRole("button", { name: /Adicionar ao carrinho · R\$\s69,90/ })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Aumentar" }));
      expect(screen.getByRole("button", { name: /Adicionar ao carrinho · R\$\s139,80/ })).toBeInTheDocument();
    });

    it("quando já está no carrinho no limite, o botão fica desabilitado como “Já está no carrinho”", async () => {
      const user = userEvent.setup();
      await open(camisetaComOpcoes({ permiteMaisDeUmaUnidade: false, limitePorPedido: null }));

      await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));

      const done = await screen.findByRole("button", { name: "Já está no carrinho" });
      expect(done).toBeDisabled();
    });

    it("com limite 3 e 2 no carrinho, só dá para somar mais 1", async () => {
      const user = userEvent.setup();
      await open();
      await user.click(screen.getByRole("button", { name: "Aumentar" }));
      await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));

      await waitFor(() => expect(screen.getByRole("button", { name: /Adicionar ao carrinho/ })).toBeEnabled());
      const quantity = screen.getByRole("group", { name: /Quantidade/ });
      expect(within(quantity).getByRole("button", { name: "Aumentar" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));
      expect(await screen.findByRole("button", { name: "Já está no carrinho" })).toBeDisabled();
      expect(savedCart().items[0].quantity).toBe(3);
    });

    it("produto sem opções: uma variação implícita, sem seletores", async () => {
      const user = userEvent.setup();
      await open(detail({ options: [], variants: [variant("v-unica", [], { effectivePriceCents: 7990 })], startingPriceCents: 7990 }));

      expect(screen.queryByRole("group", { name: "Cor" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho · R\$\s79,90/ }));
      await waitFor(() => expect(savedCart().items[0]).toMatchObject({ variantId: "v-unica", variantLabel: null }));
    });

    it("produto esgotado: não dá para adicionar", async () => {
      await open(
        camisetaComOpcoes({
          availability: "ESGOTADO",
          variants: [
            variant("v-preta-m", ["Preta", "M"], { availability: "ESGOTADO" }),
            variant("v-preta-g", ["Preta", "G"], { availability: "ESGOTADO" }),
            variant("v-branca-m", ["Branca", "M"], { availability: "ESGOTADO" }),
            variant("v-branca-g", ["Branca", "G"], { availability: "ESGOTADO" }),
          ],
        }),
      );

      expect(screen.getByRole("button", { name: "Esgotado" })).toBeDisabled();
    });

    it("o carrinho no aparelho não impede de adicionar se o armazenamento falhar", async () => {
      const user = userEvent.setup();
      await open();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("cheio", "QuotaExceededError");
      });

      await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));

      expect(await screen.findByText(/Adicionado ao carrinho\./)).toBeInTheDocument();
      vi.restoreAllMocks();
    });
  });

  describe("estados", () => {
    it("enquanto carrega, mostra o carregamento", async () => {
      mockLoja({ details: [camisetaComOpcoes()] });
      server.use(
        http.get("/api/shop/products/:id", async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return HttpResponse.json(camisetaComOpcoes());
        }),
      );
      renderLoja("/loja/p-camiseta");

      expect(await screen.findByText("Carregando o produto…")).toBeInTheDocument();
      expect(await screen.findByRole("heading", { level: 1, name: "Camiseta Dry Fit" })).toBeInTheDocument();
    });

    it("produto que não está mais à venda: avisa e leva de volta à loja", async () => {
      mockLoja({ details: [] });
      renderLoja("/loja/p-sumiu");

      expect(await screen.findByText("Este produto não está mais à venda.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ver a loja" })).toHaveAttribute("href", "/loja");
    });

    it("erro de servidor: mostra o erro e tenta de novo", async () => {
      const user = userEvent.setup();
      mockLoja({ details: [camisetaComOpcoes()] });
      let calls = 0;
      server.use(
        http.get("/api/shop/products/:id", () => {
          calls += 1;
          return calls === 1
            ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Falhou." }, { status: 500 })
            : HttpResponse.json(camisetaComOpcoes());
        }),
      );
      renderLoja("/loja/p-camiseta");

      expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o produto.");
      await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
      expect(await screen.findByRole("heading", { level: 1, name: "Camiseta Dry Fit" })).toBeInTheDocument();
    });

    it("sem conexão e sem nada carregado: estado de sem conexão", async () => {
      mockLoja({ details: [camisetaComOpcoes()] });
      server.use(http.get("/api/shop/products/:id", () => HttpResponse.error()));
      renderLoja("/loja/p-camiseta");

      expect(await screen.findByText("Sem conexão")).toBeInTheDocument();
    });
  });
});
