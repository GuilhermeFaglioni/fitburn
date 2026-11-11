import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type EffectivePermission,
  type ShopProductDetail,
  type ShopProductVariant,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { LojaAdminPage } from "../src/pages/LojaAdminPage";
import { ProductFormPage } from "../src/pages/shop/ProductFormPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

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

function variant(label: string | null, values: string[], overrides: Partial<ShopProductVariant> = {}): ShopProductVariant {
  return {
    id: `v-${label ?? "unica"}`,
    label,
    values,
    stock: 0,
    priceCents: null,
    effectivePriceCents: 8990,
    ativa: true,
    ...overrides,
  };
}

function detail(overrides: Partial<ShopProductDetail> = {}): ShopProductDetail {
  return {
    id: "p-camiseta",
    name: "Camiseta Dry Fit",
    description: null,
    category: null,
    priceCents: 8990,
    promoPriceCents: null,
    visivel: true,
    destaque: false,
    permiteMaisDeUmaUnidade: false,
    limitePorPedido: null,
    variantCount: 1,
    stock: 5,
    soldOutVariantCount: 0,
    createdAt: "2026-11-01T10:00:00.000Z",
    options: [],
    variants: [variant(null, [], { stock: 5 })],
    ...overrides,
  };
}

/** Camiseta com Cor (Preta, Branca) e Tamanho (P, M): 4 variações, a Branca · M desligada e a Preta · M com preço próprio. */
function camisetaComOpcoes(): ShopProductDetail {
  return detail({
    variantCount: 4,
    stock: 12,
    options: [
      { id: "o-cor", name: "Cor", values: [{ id: "ov-1", value: "Preta" }, { id: "ov-2", value: "Branca" }] },
      { id: "o-tam", name: "Tamanho", values: [{ id: "ov-3", value: "P" }, { id: "ov-4", value: "M" }] },
    ],
    variants: [
      variant("Preta · P", ["Preta", "P"], { stock: 6 }),
      variant("Preta · M", ["Preta", "M"], { stock: 2, priceCents: 7490, effectivePriceCents: 7490 }),
      variant("Branca · P", ["Branca", "P"], { stock: 4 }),
      variant("Branca · M", ["Branca", "M"], { stock: 0, ativa: false }),
    ],
  });
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
        <Route path="/loja-admin/produtos" element={<LojaAdminPage tab="produtos" />} />
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

type Call = { method: string; path: string; body?: Record<string, unknown> };

describe("Opções e variações do produto (L2)", () => {
  let current: ShopProductDetail;
  const calls: Call[] = [];

  const callsTo = (method: string) => calls.filter((call) => call.method === method);

  beforeEach(() => {
    calls.length = 0;
    current = camisetaComOpcoes();
    mockSuccessfulLogin("Administrador", lojaPermissions());
    server.use(
      http.get("/api/shop/admin/categories", () => HttpResponse.json([])),
      http.get("/api/shop/admin/products", () => HttpResponse.json([])),
      http.get("/api/shop/admin/products/:id", () => HttpResponse.json(current)),
      http.post("/api/shop/admin/products", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: "POST", path: "/api/shop/admin/products", body });
        return HttpResponse.json(detail({ id: "p-novo", name: String(body.name) }), { status: 201 });
      }),
      http.patch("/api/shop/admin/products/:id", async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: "PATCH", path: `/api/shop/admin/products/${String(params.id)}`, body });
        return HttpResponse.json(current);
      }),
      http.put("/api/shop/admin/products/:id/options", async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: "PUT", path: `/api/shop/admin/products/${String(params.id)}/options`, body });
        return HttpResponse.json(current);
      }),
    );
  });

  /** Preenche a opção de índice `index` (a linha já existe): nome e valores, cada valor com Enter. */
  async function fillOption(user: ReturnType<typeof userEvent.setup>, index: number, name: string, values: string[]) {
    await user.type(screen.getAllByLabelText("Nome da opção")[index]!, name);
    const input = screen.getByLabelText(`Novo valor de ${name}`);
    for (const value of values) await user.type(input, `${value}{Enter}`);
  }

  async function openNewProduct(user: ReturnType<typeof userEvent.setup>) {
    renderAt("/loja-admin/produtos/novo");
    await screen.findByRole("heading", { level: 1, name: "Novo produto" });
    await user.type(screen.getByLabelText("Nome"), "Camiseta Dry Fit");
    await user.type(screen.getByLabelText("Preço"), "89,90");
  }

  function variantsTable() {
    return screen.getByRole("table", { name: "Variações e estoque" });
  }

  describe("construtor de opções", () => {
    it("gera e atualiza a tabela ao mexer nas opções (a primeira opção varia mais devagar)", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      expect(screen.queryByRole("table", { name: "Variações e estoque" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta", "Branca"]);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 1, "Tamanho", ["P", "M"]);

      expect(screen.getByRole("heading", { level: 2, name: /Variações e estoque/ })).toHaveTextContent("4 combinações");
      const rows = within(variantsTable()).getAllByRole("row").slice(1);
      expect(rows.map((row) => within(row).getAllByRole("cell")[0]!.textContent)).toEqual([
        "Preta · P",
        "Preta · M",
        "Branca · P",
        "Branca · M",
      ]);
      expect(within(variantsTable()).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Variação",
        "Estoque",
        "Preço próprio",
        "Ativa",
      ]);
      expect(screen.getByText(/Preço próprio vazio usa o preço do produto\./)).toBeInTheDocument();

      // Remove um valor pelo ×: a tabela encolhe.
      await user.click(screen.getByRole("button", { name: "Remover Branca" }));
      expect(screen.getByRole("heading", { level: 2, name: /Variações e estoque/ })).toHaveTextContent("2 combinações");
      expect(within(variantsTable()).queryByText("Branca · P")).not.toBeInTheDocument();
    });

    it("com opções o estoque sai do campo único; sem opções ele volta", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      expect(screen.getByLabelText("Estoque")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      expect(screen.queryByLabelText("Estoque")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remover opção" }));
      expect(screen.getByLabelText("Estoque")).toBeInTheDocument();
    });

    it("mantém estoque, preço e ativa já digitados ao adicionar um valor", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta", "Branca"]);

      await user.clear(screen.getByLabelText("Estoque Preta"));
      await user.type(screen.getByLabelText("Estoque Preta"), "7");
      await user.type(screen.getByLabelText("Preço Preta"), "74,90");
      await user.click(screen.getByRole("switch", { name: "Branca ativa" }));

      await user.type(screen.getByLabelText("Novo valor de Cor"), "Laranja{Enter}");

      expect(screen.getByRole("heading", { level: 2, name: /Variações e estoque/ })).toHaveTextContent("3 combinações");
      expect(screen.getByLabelText("Estoque Preta")).toHaveValue("7");
      expect(screen.getByLabelText("Preço Preta")).toHaveValue("74,90");
      expect(screen.getByRole("switch", { name: "Branca ativa" })).toHaveAttribute("aria-checked", "false");
      // A combinação nova nasce com o padrão: estoque 0, sem preço próprio, ativa.
      expect(screen.getByLabelText("Estoque Laranja")).toHaveValue("0");
      expect(screen.getByLabelText("Preço Laranja")).toHaveValue("");
      expect(screen.getByRole("switch", { name: "Laranja ativa" })).toHaveAttribute("aria-checked", "true");
    });

    it("recusa valor repetido (ignorando maiúsculas) e respeita os limites de 3 opções e 20 valores", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta"]);

      await user.type(screen.getByLabelText("Novo valor de Cor"), "preta{Enter}");
      expect(screen.getByText("Esse valor já está nesta opção.")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^Remover (P|p)reta$/ })).toHaveLength(1);

      for (let i = 1; i < 20; i += 1) await user.type(screen.getByLabelText("Novo valor de Cor"), `Cor${i}{Enter}`);
      expect(screen.getByLabelText("Novo valor de Cor")).toBeDisabled();
      expect(screen.getByText("Máximo de 20 valores por opção.")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      expect(screen.getByRole("button", { name: "+ Adicionar opção" })).toBeDisabled();
      expect(screen.getByText("Máximo de 3 opções por produto.")).toBeInTheDocument();
    });

    it("Enter no valor não envia o formulário", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta"]);

      expect(callsTo("POST")).toHaveLength(0);
      expect(screen.getByRole("heading", { level: 1, name: "Novo produto" })).toBeInTheDocument();
    });

    it("tabela recolhida mostra X de N e expande; até 8000 combinações", async () => {
      const values = (prefix: string) => Array.from({ length: 20 }, (_, i) => ({ id: `${prefix}${i}`, value: `${prefix}${i}` }));
      current = detail({
        options: [
          { id: "o1", name: "Cor", values: values("c") },
          { id: "o2", name: "Tamanho", values: values("t") },
          { id: "o3", name: "Modelo", values: values("m") },
        ],
        variants: [],
      });
      renderAt("/loja-admin/produtos/p-camiseta");

      expect(await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ })).toHaveTextContent(
        "8000 combinações",
      );
      expect(within(variantsTable()).getAllByRole("row")).toHaveLength(6);
      expect(screen.getByText(/Mostrando 5 de 8000\./)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Mostrar todas as 8000" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+ Adicionar opção" })).toBeDisabled();
    });

    it("expande e recolhe a tabela", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["A", "B", "C", "D", "E", "F", "G"]);

      expect(screen.getByText(/Mostrando 5 de 7\./)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Mostrar todas as 7" }));
      expect(screen.getByText(/Mostrando 7 de 7\./)).toBeInTheDocument();
      expect(within(variantsTable()).getAllByRole("row")).toHaveLength(8);
      await user.click(screen.getByRole("button", { name: "Mostrar menos" }));
      expect(screen.getByText(/Mostrando 5 de 7\./)).toBeInTheDocument();
    });
  });

  describe("criar", () => {
    it("envia options e variants no POST, converte reais em centavos e manda stock 0", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta", "Branca"]);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 1, "Tamanho", ["P"]);

      await user.clear(screen.getByLabelText("Estoque Preta · P"));
      await user.type(screen.getByLabelText("Estoque Preta · P"), "6");
      await user.type(screen.getByLabelText("Preço Preta · P"), "R$ 74,90");
      await user.click(screen.getByRole("switch", { name: "Branca · P ativa" }));
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Produtos" })).toBeInTheDocument();
      expect(callsTo("POST")).toHaveLength(1);
      expect(callsTo("POST")[0]!.body).toMatchObject({
        name: "Camiseta Dry Fit",
        priceCents: 8990,
        stock: 0,
        options: [
          { name: "Cor", values: ["Preta", "Branca"] },
          { name: "Tamanho", values: ["P"] },
        ],
        variants: [
          { combination: ["Preta", "P"], stock: 6, priceCents: 7490 },
          { combination: ["Branca", "P"], ativa: false },
        ],
      });
    });

    it("o valor digitado e sem Enter entra como valor ao salvar", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await user.type(screen.getByLabelText("Nome da opção"), "Cor");
      await user.type(screen.getByLabelText("Novo valor de Cor"), "Preta");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      await waitFor(() => expect(callsTo("POST")).toHaveLength(1));
      expect(callsTo("POST")[0]!.body).toMatchObject({ options: [{ name: "Cor", values: ["Preta"] }] });
    });

    it("sem opções, é a criação da L1: stock, sem options nem variants", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.type(screen.getByLabelText("Estoque"), "20");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      await screen.findByRole("heading", { level: 1, name: "Produtos" });
      const body = callsTo("POST")[0]!.body!;
      expect(body.stock).toBe(20);
      expect(body).not.toHaveProperty("options");
      expect(body).not.toHaveProperty("variants");
    });

    it("não envia: opção sem nome, sem valor, estoque inválido e preço inválido aparecem nos campos", async () => {
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByText("O nome da opção é obrigatório.")).toBeInTheDocument();
      expect(screen.getByText("Cada opção precisa de pelo menos um valor.")).toBeInTheDocument();
      expect(callsTo("POST")).toHaveLength(0);

      await user.type(screen.getByLabelText("Nome da opção"), "Cor");
      await user.type(screen.getByLabelText("Novo valor de Cor"), "Preta{Enter}");
      await user.clear(screen.getByLabelText("Estoque Preta"));
      await user.type(screen.getByLabelText("Estoque Preta"), "2,5");
      await user.type(screen.getByLabelText("Preço Preta"), "abc");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByText("O estoque deve ser um número inteiro.")).toBeInTheDocument();
      expect(screen.getByText("Preço inválido. Use o formato 89,90.")).toBeInTheDocument();
      expect(callsTo("POST")).toHaveLength(0);
    });

    it("mostra o erro 400 da API no formulário e continua nele", async () => {
      server.use(
        http.post("/api/shop/admin/products", () =>
          HttpResponse.json({ code: "VALIDATION", message: "Defina o estoque por variação." }, { status: 400 }),
        ),
      );
      const user = userEvent.setup();
      await openNewProduct(user);
      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta"]);
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByText("Defina o estoque por variação.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Novo produto" })).toBeInTheDocument();
    });
  });

  describe("editar", () => {
    it("carrega opções e variações do detalhe da API", async () => {
      renderAt("/loja-admin/produtos/p-camiseta");

      expect(await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ })).toHaveTextContent("4 combinações");
      expect(screen.getAllByLabelText("Nome da opção").map((input) => (input as HTMLInputElement).value)).toEqual([
        "Cor",
        "Tamanho",
      ]);
      expect(screen.queryByLabelText("Estoque")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Estoque Preta · P")).toHaveValue("6");
      expect(screen.getByLabelText("Preço Preta · M")).toHaveValue("74,90");
      expect(screen.getByLabelText("Preço Preta · P")).toHaveValue("");
      expect(screen.getByRole("switch", { name: "Preta · P ativa" })).toHaveAttribute("aria-checked", "true");
    });

    it("grava o produto (PATCH sem stock) e depois as opções e variações (PUT), por valores e não por IDs", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      await user.clear(screen.getByLabelText("Estoque Preta · P"));
      await user.type(screen.getByLabelText("Estoque Preta · P"), "9");
      await user.type(screen.getByLabelText("Novo valor de Tamanho"), "G{Enter}");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Produtos" })).toBeInTheDocument();
      expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
        "PATCH /api/shop/admin/products/p-camiseta",
        "PUT /api/shop/admin/products/p-camiseta/options",
      ]);
      expect(callsTo("PATCH")[0]!.body).not.toHaveProperty("stock");
      const put = callsTo("PUT")[0]!.body as {
        options: { name: string; values: string[] }[];
        variants: { combination: string[]; stock: number; priceCents: number | null; ativa: boolean }[];
      };
      expect(put.options).toEqual([
        { name: "Cor", values: ["Preta", "Branca"] },
        { name: "Tamanho", values: ["P", "M", "G"] },
      ]);
      // A Branca · G nasceu agora e não foi editada: não vai sobreposição, a API cria com o padrão.
      expect(put.variants).toHaveLength(4);
      expect(put.variants[0]).toEqual({ combination: ["Preta", "P"], stock: 9, priceCents: null, ativa: true });
      expect(put.variants[1]).toEqual({ combination: ["Preta", "M"], stock: 2, priceCents: 7490, ativa: true });
      expect(put.variants[2]).toEqual({ combination: ["Branca", "P"], stock: 4, priceCents: null, ativa: true });
      expect(JSON.stringify(put)).not.toMatch(/o-cor|ov-1/);
    });

    it("reintroduzir uma combinação não manda sobreposição: a API recupera estoque e preço preservados", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      // Tira o M e salva; depois o produto volta da API sem o M (descontinuada não aparece no detalhe).
      await user.click(screen.getByRole("button", { name: "Remover M" }));
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));
      await screen.findByRole("heading", { level: 1, name: "Produtos" });
      const semM = (callsTo("PUT")[0]!.body as { variants: { combination: string[] }[] }).variants;
      expect(semM.map((item) => item.combination)).toEqual([["Preta", "P"], ["Branca", "P"]]);

      calls.length = 0;
      current = detail({
        variantCount: 2,
        options: [
          { id: "o-cor", name: "Cor", values: [{ id: "ov-1", value: "Preta" }, { id: "ov-2", value: "Branca" }] },
          { id: "o-tam", name: "Tamanho", values: [{ id: "ov-3", value: "P" }] },
        ],
        variants: [variant("Preta · P", ["Preta", "P"], { stock: 6 }), variant("Branca · P", ["Branca", "P"], { stock: 4 })],
      });
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findAllByRole("heading", { level: 2, name: /Variações e estoque/ });
      await user.type(screen.getByLabelText("Novo valor de Tamanho"), "M{Enter}");
      await user.click(screen.getAllByRole("button", { name: "Salvar produto" })[0]!);

      await waitFor(() => expect(callsTo("PUT")).toHaveLength(1));
      const { variants } = callsTo("PUT")[0]!.body as { variants: { combination: string[] }[] };
      expect(variants.map((item) => item.combination)).toEqual([["Preta", "P"], ["Branca", "P"]]);
      expect(JSON.stringify(variants)).not.toMatch(/"M"/);
    });

    it("renomear a opção não transfere estoque e preço para a combinação nova", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      const cor = screen.getAllByLabelText("Nome da opção")[0]!;
      await user.clear(cor);
      await user.type(cor, "Modelo");
      expect(screen.getByLabelText("Estoque Preta · M")).toHaveValue("0");
      expect(screen.getByLabelText("Preço Preta · M")).toHaveValue("");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      await screen.findByRole("heading", { level: 1, name: "Produtos" });
      const { variants } = callsTo("PUT")[0]!.body as { variants: unknown[] };
      // Todas as combinações são novas (outro nome de opção) e não foram editadas: nenhuma sobreposição.
      expect(variants).toEqual([]);
    });

    it("renomear só a capitalização do nome da opção mantém a identidade das variações", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      const cor = screen.getAllByLabelText("Nome da opção")[0]!;
      await user.clear(cor);
      await user.type(cor, "COR");

      expect(screen.getByLabelText("Estoque Preta · P")).toHaveValue("6");
      expect(screen.getByLabelText("Preço Preta · M")).toHaveValue("74,90");
    });

    it("produto simples ganha opções: PATCH sem stock e PUT com as variações", async () => {
      current = detail();
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByLabelText("Nome");
      expect(screen.getByLabelText("Estoque")).toHaveValue("5");

      await user.click(screen.getByRole("button", { name: "+ Adicionar opção" }));
      await fillOption(user, 0, "Cor", ["Preta"]);
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      await screen.findByRole("heading", { level: 1, name: "Produtos" });
      expect(callsTo("PATCH")[0]!.body).not.toHaveProperty("stock");
      expect(callsTo("PUT")[0]!.body).toEqual({
        options: [{ name: "Cor", values: ["Preta"] }],
        variants: [],
      });
    });

    it("tirar todas as opções: PUT limpa as opções antes do PATCH mandar o estoque único", async () => {
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      await user.click(screen.getByRole("button", { name: "Remover opção Cor" }));
      await user.click(screen.getByRole("button", { name: "Remover opção Tamanho" }));
      expect(screen.queryByRole("table", { name: "Variações e estoque" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Estoque")).toHaveValue("");
      await user.type(screen.getByLabelText("Estoque"), "15");
      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      await screen.findByRole("heading", { level: 1, name: "Produtos" });
      expect(calls.map((call) => call.method)).toEqual(["PUT", "PATCH"]);
      expect(callsTo("PUT")[0]!.body).toEqual({ options: [] });
      expect(callsTo("PATCH")[0]!.body).toMatchObject({ stock: 15 });
    });

    it("mostra o erro 400 do PUT no formulário", async () => {
      server.use(
        http.put("/api/shop/admin/products/:id/options", () =>
          HttpResponse.json({ code: "VALIDATION", message: "Combinação inexistente." }, { status: 400 }),
        ),
      );
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      await user.click(screen.getByRole("button", { name: "Salvar produto" }));

      expect(await screen.findByText("Combinação inexistente.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Editar produto" })).toBeInTheDocument();
    });

    it("carregando e erro do detalhe", async () => {
      server.use(
        http.get("/api/shop/admin/products/:id", () =>
          HttpResponse.json({ code: "NOT_FOUND", message: "Produto não encontrado." }, { status: 404 }),
        ),
      );
      renderAt("/loja-admin/produtos/p-camiseta");

      expect(screen.queryByLabelText("Nome da opção")).not.toBeInTheDocument();
      expect(await screen.findByText("Não foi possível carregar o produto.")).toBeInTheDocument();
    });

    it("sem Editar: opções, tabela e salvar ficam bloqueados, com o motivo", async () => {
      mockSuccessfulLogin("Professor", lojaPermissions([PermissionAction.VIEW]));
      renderAt("/loja-admin/produtos/p-camiseta");
      await screen.findByRole("heading", { level: 2, name: /Variações e estoque/ });

      expect(screen.getByText("Você não tem permissão para alterar produtos.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Salvar produto" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "+ Adicionar opção" })).toBeDisabled();
      expect(screen.getByLabelText("Estoque Preta · P")).toBeDisabled();
      expect(screen.getByRole("switch", { name: "Preta · P ativa" })).toBeDisabled();
      expect(screen.getAllByLabelText("Nome da opção")[0]).toBeDisabled();
    });
  });
});
