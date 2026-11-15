import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type EffectivePermission,
  type ShopCategory,
  type ShopProduct,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { LojaAdminPage } from "../src/pages/LojaAdminPage";
import { ProductFormPage } from "../src/pages/shop/ProductFormPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

function product(id: string, name: string, overrides: Partial<ShopProduct> = {}): ShopProduct {
  return {
    id,
    name,
    description: null,
    category: null,
    priceCents: 3990,
    promoPriceCents: null,
    visivel: true,
    destaque: false,
    permiteMaisDeUmaUnidade: false,
    limitePorPedido: null,
    variantCount: 1,
    stock: 5,
    soldOutVariantCount: 0,
    createdAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

function category(id: string, name: string, position: number, productCount = 0): ShopCategory {
  return { id, name, position, productCount };
}

const ALL_ACTIONS = [
  PermissionAction.VIEW,
  PermissionAction.CREATE,
  PermissionAction.EDIT,
  PermissionAction.DELETE,
  PermissionAction.EXECUTE,
];

function lojaPermissions(actions: EffectivePermission["actions"] = ALL_ACTIONS): EffectivePermission[] {
  return [{ module: Module.LOJA, actions, scope: PermissionScope.ALL }];
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function LoggedIn() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return (
    <>
      <Routes>
        <Route path="/loja-admin" element={<Navigate to="/loja-admin/produtos" replace />} />
        <Route path="/loja-admin/produtos" element={<LojaAdminPage tab="produtos" />} />
        <Route path="/loja-admin/categorias" element={<LojaAdminPage tab="categorias" />} />
        <Route path="/loja-admin/produtos/novo" element={<ProductFormPage />} />
        <Route path="/loja-admin/produtos/:id" element={<ProductFormPage />} />
      </Routes>
      <LocationProbe />
    </>
  );
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

type Call = { method: string; path: string; body?: unknown; search?: string };

describe("Loja no admin", () => {
  let products: ShopProduct[];
  let categories: ShopCategory[];
  const calls: Call[] = [];

  function lastCall(method: string, path: string): Call | undefined {
    return [...calls].reverse().find((call) => call.method === method && call.path === path);
  }

  function useShopHandlers() {
    server.use(
      http.get("/api/shop/admin/categories", () => HttpResponse.json(categories)),
      http.post("/api/shop/admin/categories", async ({ request }) => {
        const body = (await request.json()) as { name: string };
        calls.push({ method: "POST", path: "/api/shop/admin/categories", body });
        if (categories.some((item) => item.name === body.name))
          return HttpResponse.json({ code: "CATEGORY_NAME_TAKEN", message: "Já existe uma categoria com este nome." }, { status: 409 });
        const created = category(`c-${categories.length + 1}`, body.name, categories.length + 1);
        categories = [...categories, created];
        return HttpResponse.json(created, { status: 201 });
      }),
      http.put("/api/shop/admin/categories/order", async ({ request }) => {
        const body = (await request.json()) as { ids: string[] };
        calls.push({ method: "PUT", path: "/api/shop/admin/categories/order", body });
        categories = body.ids.map((id, index) => ({ ...categories.find((item) => item.id === id)!, position: index + 1 }));
        return HttpResponse.json(categories);
      }),
      http.patch("/api/shop/admin/categories/:id", async ({ params, request }) => {
        const body = (await request.json()) as { name: string };
        calls.push({ method: "PATCH", path: `/api/shop/admin/categories/${String(params.id)}`, body });
        categories = categories.map((item) => (item.id === params.id ? { ...item, name: body.name } : item));
        return HttpResponse.json(categories.find((item) => item.id === params.id));
      }),
      http.delete("/api/shop/admin/categories/:id", ({ params }) => {
        calls.push({ method: "DELETE", path: `/api/shop/admin/categories/${String(params.id)}` });
        const target = categories.find((item) => item.id === params.id)!;
        if (target.productCount > 0)
          return HttpResponse.json(
            { code: "CATEGORY_IN_USE", message: "Esta categoria tem produtos. Mova os produtos antes de excluir." },
            { status: 409 },
          );
        categories = categories.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/shop/admin/products", ({ request }) => {
        const url = new URL(request.url);
        calls.push({ method: "GET", path: "/api/shop/admin/products", search: url.search });
        return HttpResponse.json(products);
      }),
      http.get("/api/shop/admin/products/:id", ({ params }) => {
        const found = products.find((item) => item.id === params.id);
        // Detalhe (L2): produto simples = sem opções e uma variação única.
        return found
          ? HttpResponse.json({
              ...found,
              options: [],
              variants: [
                {
                  id: `v-${found.id}`,
                  label: null,
                  values: [],
                  stock: found.stock,
                  priceCents: null,
                  effectivePriceCents: found.promoPriceCents ?? found.priceCents,
                  ativa: true,
                },
              ],
            })
          : HttpResponse.json({ code: "NOT_FOUND", message: "Produto não encontrado." }, { status: 404 });
      }),
      http.post("/api/shop/admin/products", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: "POST", path: "/api/shop/admin/products", body });
        if (body.destaque && products.filter((item) => item.destaque).length >= 3)
          return HttpResponse.json(
            { code: "FEATURED_LIMIT_REACHED", message: "Já há 3 produtos em destaque. Remova um destaque antes." },
            { status: 409 },
          );
        const created = product(`p-${products.length + 1}`, String(body.name), {
          priceCents: Number(body.priceCents),
          stock: Number(body.stock),
        });
        products = [...products, created];
        return HttpResponse.json(created, { status: 201 });
      }),
      http.patch("/api/shop/admin/products/:id", async ({ params, request }) => {
        const body = (await request.json()) as Partial<ShopProduct>;
        calls.push({ method: "PATCH", path: `/api/shop/admin/products/${String(params.id)}`, body });
        products = products.map((item) => (item.id === params.id ? { ...item, ...body } : item));
        return HttpResponse.json(products.find((item) => item.id === params.id));
      }),
      http.delete("/api/shop/admin/products/:id", ({ params }) => {
        calls.push({ method: "DELETE", path: `/api/shop/admin/products/${String(params.id)}` });
        products = products.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
  }

  beforeEach(() => {
    calls.length = 0;
    categories = [
      category("c-vest", "Vestuário", 1, 2),
      category("c-garr", "Garrafas", 2, 1),
      category("c-acess", "Acessórios", 3, 0),
    ];
    products = [
      product("p-camiseta", "Camiseta Dry Fit", {
        category: { id: "c-vest", name: "Vestuário" },
        priceCents: 8990,
        promoPriceCents: 6990,
        destaque: true,
        variantCount: 12,
        stock: 34,
        soldOutVariantCount: 1,
        description: "Tecido leve com secagem rápida.",
        permiteMaisDeUmaUnidade: true,
        limitePorPedido: 3,
      }),
      product("p-garrafa", "Garrafa térmica 750 ml", {
        category: { id: "c-garr", name: "Garrafas" },
        priceCents: 7990,
        variantCount: 2,
        stock: 9,
      }),
      product("p-toalha", "Toalha de treino", { priceCents: 3990, stock: 0 }),
      product("p-viseira", "Viseira (rascunho)", { priceCents: 4990, visivel: false, stock: 15 }),
    ];
    mockSuccessfulLogin("Administrador", lojaPermissions());
    useShopHandlers();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    setBrowserOnline(true);
  });

  function row(name: string) {
    return screen.getByText(name, { selector: "td, td span" }).closest("tr")!;
  }

  describe("Rotas e cabeçalho", () => {
    it("/loja-admin redireciona para os produtos", async () => {
      renderAt("/loja-admin");

      expect(await screen.findByRole("heading", { level: 1, name: "Produtos" })).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/loja-admin/produtos");
    });

    it("as abas Produtos e Categorias navegam entre as rotas, e a ação do cabeçalho muda com a aba", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      const tabs = await screen.findByRole("group", { name: "Seções da loja" });
      expect(within(tabs).getByRole("button", { name: "Produtos" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("Loja", { selector: "p" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+ Novo produto" })).toBeInTheDocument();

      await user.click(within(tabs).getByRole("button", { name: "Categorias" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Categorias" })).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/loja-admin/categorias");
      expect(within(tabs).getByRole("button", { name: "Categorias" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "+ Nova categoria" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "+ Novo produto" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pedidos" })).not.toBeInTheDocument();
    });
  });

  describe("Produtos: lista", () => {
    it("mostra produto, selo DESTAQUE, categoria, preço com promoção riscada, variações, estoque e visibilidade", async () => {
      renderAt("/loja-admin/produtos");

      const table = await screen.findByRole("table", { name: "Produtos" });
      expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Produto",
        "Categoria",
        "Preço",
        "Variações",
        "Estoque",
        "Visibilidade",
        "Ações",
      ]);

      const camiseta = row("Camiseta Dry Fit");
      expect(within(camiseta).getByText("DESTAQUE")).toBeInTheDocument();
      expect(within(camiseta).getByText("Vestuário")).toBeInTheDocument();
      expect(within(camiseta).getByText("R$ 89,90").tagName).toBe("S");
      expect(within(camiseta).getByText("R$ 89,90")).toHaveTextContent("R$ 89,90");
      expect(camiseta).toHaveTextContent("R$ 69,90");
      expect(within(camiseta).getByText("12")).toBeInTheDocument();
      expect(within(camiseta).getByText("(1 esgotada)")).toBeInTheDocument();
      expect(within(camiseta).getByText("VISÍVEL")).toBeInTheDocument();

      const garrafa = row("Garrafa térmica 750 ml");
      expect(within(garrafa).queryByText("DESTAQUE")).not.toBeInTheDocument();
      expect(garrafa.querySelector("s")).toBeNull();
      expect(garrafa).toHaveTextContent("R$ 79,90");

      // Sem categoria: travessão; estoque zero em tom de perigo; oculto.
      const toalha = row("Toalha de treino");
      expect(within(toalha).getByText("—")).toBeInTheDocument();
      expect(within(toalha).getByText("0")).toHaveClass("fb-shop-stock--zero");
      expect(within(row("Viseira (rascunho)")).getByText("OCULTO")).toBeInTheDocument();
      expect(
        screen.getByText(/Excluir tira o produto da loja e da lista, mas mantém o histórico dos pedidos/),
      ).toBeInTheDocument();
    });

    it("os filtros de busca, categoria e visibilidade mandam os parâmetros certos à API", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });
      await waitFor(() => expect(lastCall("GET", "/api/shop/admin/products")?.search).toBe(""));

      await user.type(screen.getByRole("searchbox", { name: "Buscar produto" }), "camis");
      await waitFor(() => expect(lastCall("GET", "/api/shop/admin/products")?.search).toBe("?q=camis"));

      await user.selectOptions(await screen.findByRole("combobox", { name: "Categoria" }), "Vestuário");
      await waitFor(() =>
        expect(lastCall("GET", "/api/shop/admin/products")?.search).toBe("?q=camis&categoryId=c-vest"),
      );

      await user.selectOptions(screen.getByRole("combobox", { name: "Visibilidade" }), "Só ocultos");
      await waitFor(() =>
        expect(lastCall("GET", "/api/shop/admin/products")?.search).toBe(
          "?q=camis&categoryId=c-vest&visibility=hidden",
        ),
      );
      // A lista anterior fica na tela enquanto o filtro novo carrega.
      expect(screen.getByRole("table", { name: "Produtos" })).toBeInTheDocument();
    });

    it("busca sem resultado mostra uma mensagem própria, e a barra de filtros continua", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });
      products = [];

      await user.type(screen.getByRole("searchbox", { name: "Buscar produto" }), "zzz");

      expect(await screen.findByText("Nenhum produto encontrado.")).toBeInTheDocument();
      expect(screen.queryByText("Nenhum produto cadastrado ainda.")).not.toBeInTheDocument();
      expect(screen.getByRole("searchbox", { name: "Buscar produto" })).toBeInTheDocument();
    });

    it("sem produtos: estado vazio", async () => {
      products = [];
      renderAt("/loja-admin/produtos");

      expect(await screen.findByText("Nenhum produto cadastrado ainda.")).toBeInTheDocument();
    });

    it("carregando: mostra o estado de carregando até a lista chegar", async () => {
      server.use(
        http.get("/api/shop/admin/products", async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return HttpResponse.json(products);
        }),
      );
      renderAt("/loja-admin/produtos");

      expect(await screen.findByText("Carregando produtos…")).toBeInTheDocument();
      expect(await screen.findByRole("table", { name: "Produtos" })).toBeInTheDocument();
    });

    it("erro ao carregar: mostra o erro e tenta de novo", async () => {
      const user = userEvent.setup();
      let fail = true;
      server.use(
        http.get("/api/shop/admin/products", () =>
          fail ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro" }, { status: 500 }) : HttpResponse.json(products),
        ),
      );
      renderAt("/loja-admin/produtos");

      expect(await screen.findByText("Não foi possível carregar os produtos.")).toBeInTheDocument();
      fail = false;
      await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByRole("table", { name: "Produtos" })).toBeInTheDocument();
    });
  });

  describe("Produtos: ações da linha", () => {
    it("Ocultar manda visivel false, e Mostrar manda true", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      await user.click(within(row("Garrafa térmica 750 ml")).getByRole("button", { name: "Ocultar produto Garrafa térmica 750 ml" }));

      await waitFor(() => expect(within(row("Garrafa térmica 750 ml")).getByText("OCULTO")).toBeInTheDocument());
      expect(lastCall("PATCH", "/api/shop/admin/products/p-garrafa")?.body).toEqual({ visivel: false });

      await user.click(within(row("Viseira (rascunho)")).getByRole("button", { name: "Mostrar produto Viseira (rascunho)" }));

      await waitFor(() => expect(within(row("Viseira (rascunho)")).getByText("VISÍVEL")).toBeInTheDocument());
      expect(lastCall("PATCH", "/api/shop/admin/products/p-viseira")?.body).toEqual({ visivel: true });
    });

    it("a recusa da API ao ocultar aparece na tela", async () => {
      const user = userEvent.setup();
      server.use(
        http.patch("/api/shop/admin/products/:id", () =>
          HttpResponse.json({ code: "NOT_FOUND", message: "Produto não encontrado." }, { status: 404 }),
        ),
      );
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      await user.click(within(row("Garrafa térmica 750 ml")).getByRole("button", { name: "Ocultar produto Garrafa térmica 750 ml" }));

      expect(await screen.findByText("Produto não encontrado.")).toBeInTheDocument();
    });

    it("Excluir pede confirmação (com o foco em Cancelar) e só então chama a API", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      await user.click(within(row("Toalha de treino")).getByRole("button", { name: "Excluir produto Toalha de treino" }));
      const dialog = screen.getByRole("dialog", { name: "Excluir o produto Toalha de treino?" });
      expect(dialog).toHaveTextContent("exclusão lógica");
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
      expect(lastCall("DELETE", "/api/shop/admin/products/p-toalha")).toBeUndefined();

      await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls.some((call) => call.method === "DELETE")).toBe(false);

      await user.click(within(row("Toalha de treino")).getByRole("button", { name: "Excluir produto Toalha de treino" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar exclusão" }));

      await waitFor(() => expect(screen.queryByText("Toalha de treino")).not.toBeInTheDocument());
      expect(lastCall("DELETE", "/api/shop/admin/products/p-toalha")).toBeDefined();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Editar leva ao formulário do produto", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      await user.click(within(row("Garrafa térmica 750 ml")).getByRole("button", { name: "Editar produto Garrafa térmica 750 ml" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Editar produto" })).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/loja-admin/produtos/p-garrafa");
    });

    it("+ Novo produto leva ao formulário em branco", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      await user.click(screen.getByRole("button", { name: "+ Novo produto" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Novo produto" })).toBeInTheDocument();
      expect(screen.getByLabelText("Nome")).toHaveValue("");
    });
  });

  describe("Formulário de produto", () => {
    it("tem trilha, cartões e botões do cabeçalho, com Opções e sem Fotos nem tabela de variações", async () => {
      renderAt("/loja-admin/produtos/novo");

      expect(await screen.findByRole("heading", { level: 1, name: "Novo produto" })).toBeInTheDocument();
      const crumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
      expect(crumb).toHaveTextContent("Loja / Produtos / Novo produto");
      expect(screen.getByRole("heading", { level: 2, name: "Dados do produto" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Regras de venda" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Salvar produto" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Opções" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+ Adicionar opção" })).toBeInTheDocument();
      // Sem opções, a tela é a da L1: estoque único e nenhuma tabela de variações.
      expect(screen.getByLabelText("Estoque")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /Fotos|Variações/ })).not.toBeInTheDocument();
      // Visível já vem ligado; destaque desligado.
      expect(screen.getByRole("switch", { name: "Visível na loja" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("switch", { name: "Destaque no Início" })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText("No máximo 3 produtos.")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Sem categoria" })).toBeInTheDocument();
    });

    it("cria um produto simples: converte reais em centavos e volta para a lista", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      await user.type(screen.getByLabelText("Nome"), "Squeeze 500 ml");
      await user.selectOptions(await screen.findByRole("combobox", { name: "Categoria" }), "Garrafas");
      await user.type(screen.getByLabelText("Preço"), "R$ 1.249,90");
      await user.type(screen.getByLabelText("Preço promocional (opcional)"), "99,5");
      await user.type(screen.getByLabelText("Descrição"), "  Bico retrátil.  ");
      await user.type(screen.getByLabelText("Estoque"), "20");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Produtos" })).toBeInTheDocument();
      expect(lastCall("POST", "/api/shop/admin/products")?.body).toEqual({
        name: "Squeeze 500 ml",
        description: "Bico retrátil.",
        categoryId: "c-garr",
        priceCents: 124990,
        promoPriceCents: 9950,
        stock: 20,
        visivel: true,
        destaque: false,
        permiteMaisDeUmaUnidade: false,
        limitePorPedido: null,
      });
      expect(await screen.findByText("Squeeze 500 ml")).toBeInTheDocument();
    });

    it("o campo de limite fica desabilitado com o switch desligado e libera ao ligar", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });
      const limit = screen.getByLabelText("Limite por pedido");
      const permit = screen.getByRole("switch", { name: "Permitir mais de uma unidade por pedido" });

      expect(permit).toHaveAttribute("aria-checked", "false");
      expect(limit).toBeDisabled();

      await user.click(permit);
      expect(limit).toBeEnabled();
      await user.type(limit, "4");

      await user.type(screen.getByLabelText("Nome"), "Kit");
      await user.type(screen.getByLabelText("Preço"), "10");
      await user.type(screen.getByLabelText("Estoque"), "3");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      await waitFor(() => expect(lastCall("POST", "/api/shop/admin/products")).toBeDefined());
      expect(lastCall("POST", "/api/shop/admin/products")?.body).toMatchObject({
        permiteMaisDeUmaUnidade: true,
        limitePorPedido: 4,
      });
    });

    it("mostra o erro de cada campo (aria-invalid) e não envia nada", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      await user.type(screen.getByLabelText("Preço"), "abc");
      await user.type(screen.getByLabelText("Estoque"), "2,5");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(screen.getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("O nome do produto é obrigatório.")).toBeInTheDocument();
      expect(screen.getByLabelText("Preço")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Preço inválido. Use o formato 89,90.")).toBeInTheDocument();
      expect(screen.getByLabelText("Estoque")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("O estoque deve ser um número inteiro.")).toBeInTheDocument();
      expect(calls.some((call) => call.method === "POST")).toBe(false);
    });

    it("promoção maior ou igual ao preço mostra o erro no campo e não envia", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      await user.type(screen.getByLabelText("Nome"), "Boné");
      await user.type(screen.getByLabelText("Preço"), "50,00");
      await user.type(screen.getByLabelText("Preço promocional (opcional)"), "50");
      await user.type(screen.getByLabelText("Estoque"), "4");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(screen.getByLabelText("Preço promocional (opcional)")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("O preço promocional deve ser menor que o preço.")).toBeInTheDocument();
      expect(calls.some((call) => call.method === "POST")).toBe(false);
    });

    it("o erro FEATURED_LIMIT_REACHED da API aparece no formulário, que continua aberto com os dados", async () => {
      const user = userEvent.setup();
      products = ["a", "b", "c"].map((id) => product(`p-${id}`, `Destaque ${id}`, { destaque: true }));
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      await user.type(screen.getByLabelText("Nome"), "Quarto destaque");
      await user.type(screen.getByLabelText("Preço"), "20");
      await user.type(screen.getByLabelText("Estoque"), "1");
      await user.click(screen.getByRole("switch", { name: "Destaque no Início" }));
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Já há 3 produtos em destaque. Remova um destaque antes.");
      expect(screen.getByRole("heading", { level: 1, name: "Novo produto" })).toBeInTheDocument();
      expect(screen.getByLabelText("Nome")).toHaveValue("Quarto destaque");
    });

    it("editar carrega os valores do produto e salva só o que foi enviado pelo formulário", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");

      expect(await screen.findByLabelText("Nome")).toHaveValue("Camiseta Dry Fit");
      expect(screen.getByRole("heading", { level: 1, name: "Editar produto" })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Trilha de navegação" })).toHaveTextContent(
        "Loja / Produtos / Camiseta Dry Fit",
      );
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveValue("c-vest"));
      expect(screen.getByLabelText("Preço")).toHaveValue("89,90");
      expect(screen.getByLabelText("Preço promocional (opcional)")).toHaveValue("69,90");
      expect(screen.getByLabelText("Descrição")).toHaveValue("Tecido leve com secagem rápida.");
      expect(screen.getByLabelText("Estoque")).toHaveValue("34");
      expect(screen.getByRole("switch", { name: "Permitir mais de uma unidade por pedido" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText("Limite por pedido")).toHaveValue("3");
      expect(screen.getByRole("switch", { name: "Destaque no Início" })).toHaveAttribute("aria-checked", "true");

      await user.clear(screen.getByLabelText("Preço promocional (opcional)"));
      await user.click(screen.getByRole("switch", { name: "Permitir mais de uma unidade por pedido" }));
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Produtos" })).toBeInTheDocument();
      expect(lastCall("PATCH", "/api/shop/admin/products/p-camiseta")?.body).toEqual({
        name: "Camiseta Dry Fit",
        description: "Tecido leve com secagem rápida.",
        categoryId: "c-vest",
        priceCents: 8990,
        promoPriceCents: null,
        stock: 34,
        visivel: true,
        destaque: true,
        // Desligar "permitir mais de uma unidade" limpa o limite.
        permiteMaisDeUmaUnidade: false,
        limitePorPedido: null,
      });
    });

    it("produto inexistente: mostra o erro em vez do formulário", async () => {
      renderAt("/loja-admin/produtos/nao-existe");

      expect(await screen.findByText("Não foi possível carregar o produto.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    });

    it("Cancelar volta para a lista sem gravar", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Produtos" })).toBeInTheDocument();
      expect(calls.some((call) => call.method === "POST")).toBe(false);
    });
  });

  describe("Categorias", () => {
    it("lista categoria, quantidade de produtos e ordem", async () => {
      renderAt("/loja-admin/categorias");

      const table = await screen.findByRole("table", { name: "Categorias" });
      expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Categoria",
        "Produtos",
        "Ordem",
        "Ações",
      ]);
      const vestuario = row("Vestuário");
      expect(vestuario).toHaveTextContent("2");
      expect(within(vestuario).getByText("1", { selector: ".fb-shop-order__number" })).toBeInTheDocument();
      expect(
        screen.getByText(/Categoria com produtos não pode ser excluída; mova os produtos antes\. A categoria é opcional no produto\./),
      ).toBeInTheDocument();
    });

    it("sem categorias: estado vazio", async () => {
      categories = [];
      renderAt("/loja-admin/categorias");

      expect(await screen.findByText("Nenhuma categoria cadastrada ainda.")).toBeInTheDocument();
    });

    it("cria uma categoria pelo diálogo", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      await user.click(screen.getByRole("button", { name: "+ Nova categoria" }));
      const dialog = screen.getByRole("dialog", { name: "Nova categoria" });
      await user.type(within(dialog).getByLabelText("Nome"), "Suplementos");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText("Suplementos")).toBeInTheDocument();
      expect(lastCall("POST", "/api/shop/admin/categories")?.body).toEqual({ name: "Suplementos" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("nome vazio mostra o erro no campo; nome repetido mostra a mensagem da API no diálogo", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      await user.click(screen.getByRole("button", { name: "+ Nova categoria" }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
      expect(within(dialog).getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
      expect(within(dialog).getByText("O nome da categoria é obrigatório.")).toBeInTheDocument();

      await user.type(within(dialog).getByLabelText("Nome"), "Garrafas");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await within(dialog).findByText("Já existe uma categoria com este nome.")).toBeInTheDocument();
    });

    it("renomeia uma categoria", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      await user.click(screen.getByRole("button", { name: "Renomear categoria Acessórios" }));
      const dialog = screen.getByRole("dialog", { name: "Renomear categoria" });
      const name = within(dialog).getByLabelText("Nome");
      expect(name).toHaveValue("Acessórios");
      await user.clear(name);
      await user.type(name, "Acessórios de treino");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      expect(await screen.findByText("Acessórios de treino")).toBeInTheDocument();
      expect(lastCall("PATCH", "/api/shop/admin/categories/c-acess")?.body).toEqual({ name: "Acessórios de treino" });
    });

    it("Subir e Descer mandam a lista completa na nova ordem, e as pontas ficam desabilitadas", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      expect(screen.getByRole("button", { name: "Subir categoria Vestuário" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Descer categoria Acessórios" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Subir categoria Acessórios" }));

      await waitFor(() =>
        expect(lastCall("PUT", "/api/shop/admin/categories/order")?.body).toEqual({
          ids: ["c-vest", "c-acess", "c-garr"],
        }),
      );
      await waitFor(() =>
        expect(screen.getAllByRole("row").slice(1).map((r) => r.querySelector("td")?.textContent)).toEqual([
          "Vestuário",
          "Acessórios",
          "Garrafas",
        ]),
      );

      await user.click(screen.getByRole("button", { name: "Descer categoria Vestuário" }));

      await waitFor(() =>
        expect(lastCall("PUT", "/api/shop/admin/categories/order")?.body).toEqual({
          ids: ["c-acess", "c-vest", "c-garr"],
        }),
      );
    });

    it("exclui uma categoria sem produtos depois da confirmação", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      await user.click(screen.getByRole("button", { name: "Excluir categoria Acessórios" }));
      const dialog = screen.getByRole("dialog", { name: "Excluir a categoria Acessórios?" });
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
      await user.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));

      await waitFor(() => expect(screen.queryByRole("row", { name: /Acessórios/ })).not.toBeInTheDocument());
      expect(lastCall("DELETE", "/api/shop/admin/categories/c-acess")).toBeDefined();
    });

    it("excluir categoria com produtos mostra a mensagem da API no diálogo, que continua aberto", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      await user.click(screen.getByRole("button", { name: "Excluir categoria Vestuário" }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));

      expect(
        await within(dialog).findByText("Esta categoria tem produtos. Mova os produtos antes de excluir."),
      ).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Vestuário", { selector: "td" })).toBeInTheDocument();
    });

    it("carregando e erro ao carregar", async () => {
      const user = userEvent.setup();
      let fail = true;
      server.use(
        http.get("/api/shop/admin/categories", async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return fail
            ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro" }, { status: 500 })
            : HttpResponse.json(categories);
        }),
      );
      renderAt("/loja-admin/categorias");

      expect(await screen.findByText("Carregando categorias…")).toBeInTheDocument();
      expect(await screen.findByText("Não foi possível carregar as categorias.")).toBeInTheDocument();
      fail = false;
      await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
      expect(await screen.findByRole("table", { name: "Categorias" })).toBeInTheDocument();
    });
  });

  describe("Sem permissão", () => {
    const reasonFor = (text: string) => expect.stringContaining(text);

    it("só com Ver: os botões de criar, editar e excluir ficam bloqueados, com o motivo", async () => {
      mockSuccessfulLogin("Professor", lojaPermissions([PermissionAction.VIEW]));
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      const create = screen.getByRole("button", { name: "+ Novo produto" });
      expect(create).toBeDisabled();
      expect(create).toHaveAttribute("title", reasonFor("criar produtos"));
      const camiseta = row("Camiseta Dry Fit");
      for (const [name, reason] of [
        ["Editar produto Camiseta Dry Fit", "alterar produtos"],
        ["Ocultar produto Camiseta Dry Fit", "alterar produtos"],
        ["Excluir produto Camiseta Dry Fit", "excluir produtos"],
      ] as const) {
        const button = within(camiseta).getByRole("button", { name });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("title", reasonFor(reason));
      }
    });

    it("só com Ver: categorias também bloqueadas, incluindo Subir e Descer", async () => {
      mockSuccessfulLogin("Professor", lojaPermissions([PermissionAction.VIEW]));
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });

      expect(screen.getByRole("button", { name: "+ Nova categoria" })).toBeDisabled();
      for (const name of [
        "Renomear categoria Garrafas",
        "Subir categoria Garrafas",
        "Descer categoria Garrafas",
        "Excluir categoria Garrafas",
      ]) {
        expect(screen.getByRole("button", { name })).toBeDisabled();
        expect(screen.getByRole("button", { name })).toHaveAttribute("title", reasonFor("permissão"));
      }
    });

    it("o formulário não salva sem Criar: fica bloqueado, com o motivo na tela", async () => {
      mockSuccessfulLogin("Professor", lojaPermissions([PermissionAction.VIEW, PermissionAction.EDIT]));
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      const save = screen.getByRole("button", { name: "Salvar produto" });
      expect(save).toBeDisabled();
      expect(save).toHaveAttribute("title", reasonFor("criar produtos"));
      expect(screen.getByText("Você não tem permissão para criar produtos.")).toBeInTheDocument();
      expect(screen.getByLabelText("Nome")).toBeDisabled();
      expect(screen.getByRole("button", { name: "+ Adicionar opção" })).toBeDisabled();
    });

    it("com Editar mas sem Excluir: só Excluir fica bloqueado", async () => {
      mockSuccessfulLogin("Professor", lojaPermissions([PermissionAction.VIEW, PermissionAction.EDIT]));
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      const camiseta = row("Camiseta Dry Fit");
      expect(within(camiseta).getByRole("button", { name: "Editar produto Camiseta Dry Fit" })).toBeEnabled();
      expect(within(camiseta).getByRole("button", { name: "Ocultar produto Camiseta Dry Fit" })).toBeEnabled();
      expect(within(camiseta).getByRole("button", { name: "Excluir produto Camiseta Dry Fit" })).toBeDisabled();
    });
  });

  describe("Sem conexão", () => {
    it("gravar fica desabilitado nas linhas, e a lista continua na tela", async () => {
      renderAt("/loja-admin/produtos");
      await screen.findByRole("table", { name: "Produtos" });

      setBrowserOnline(false);

      await waitFor(() =>
        expect(within(row("Garrafa térmica 750 ml")).getByRole("button", { name: "Ocultar produto Garrafa térmica 750 ml" })).toBeDisabled(),
      );
      const excluir = within(row("Garrafa térmica 750 ml")).getByRole("button", { name: "Excluir produto Garrafa térmica 750 ml" });
      expect(excluir).toBeDisabled();
      expect(excluir).toHaveAttribute("title", expect.stringContaining("sem conexão"));
      // Navegar não é gravar: Editar continua disponível.
      expect(within(row("Garrafa térmica 750 ml")).getByRole("button", { name: "Editar produto Garrafa térmica 750 ml" })).toBeEnabled();
      expect(screen.getByText("Garrafa térmica 750 ml")).toBeInTheDocument();
    });

    it("o Salvar produto do formulário fica desabilitado", async () => {
      renderAt("/loja-admin/produtos/novo");
      await screen.findByRole("heading", { level: 1, name: "Novo produto" });

      setBrowserOnline(false);

      await waitFor(() => expect(screen.getByRole("button", { name: "Salvar produto" })).toBeDisabled());
      setBrowserOnline(true);
      await waitFor(() => expect(screen.getByRole("button", { name: "Salvar produto" })).toBeEnabled());
    });

    it("categorias: Subir, Descer e Salvar do diálogo ficam desabilitados", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });
      await user.click(screen.getByRole("button", { name: "+ Nova categoria" }));

      setBrowserOnline(false);

      await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Salvar" })).toBeDisabled());
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
      expect(screen.getByRole("button", { name: "Subir categoria Acessórios" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Descer categoria Garrafas" })).toBeDisabled();
    });

    it("a confirmação de exclusão não confirma offline", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/categorias");
      await screen.findByRole("table", { name: "Categorias" });
      await user.click(screen.getByRole("button", { name: "Excluir categoria Acessórios" }));

      setBrowserOnline(false);

      await waitFor(() =>
        expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar exclusão" })).toBeDisabled(),
      );
    });
  });
});
