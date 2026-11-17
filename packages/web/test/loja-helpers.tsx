import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import type {
  ClientShopCategory,
  ClientShopProduct,
  ClientShopProductDetail,
  ClientShopVariant,
  ShopProductImage,
} from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { CartProvider } from "../src/lib/shop/cart";
import { server } from "./msw-server";

/** Apoio das telas da loja do cliente (L4, #193): dados fictícios, sessão de cliente e o app roteado. */

export const CLIENT_ID = "user-cliente";

export function image(id: string, position = 0): ShopProductImage {
  return {
    id,
    mimeType: "image/webp",
    sizeBytes: 90_000,
    position,
    isCover: position === 0,
    url: `/api/shop/product-images/${id}`,
  };
}

export function product(overrides: Partial<ClientShopProduct> = {}): ClientShopProduct {
  return {
    id: "p-garrafa",
    name: "Garrafa térmica 750 ml",
    description: null,
    category: null,
    startingPriceCents: 7990,
    originalPriceCents: null,
    hasPriceVariation: false,
    availability: "DISPONIVEL",
    destaque: false,
    coverImage: null,
    ...overrides,
  };
}

export function variant(
  id: string,
  values: string[],
  overrides: Partial<ClientShopVariant> = {},
): ClientShopVariant {
  return {
    id,
    label: values.length ? values.join(" · ") : null,
    values,
    effectivePriceCents: 6990,
    availability: "DISPONIVEL",
    ...overrides,
  };
}

export function detail(overrides: Partial<ClientShopProductDetail> = {}): ClientShopProductDetail {
  return {
    ...product({
      id: "p-camiseta",
      name: "Camiseta Dry Fit",
      description: "Tecido leve com secagem rápida.",
      category: { id: "c-vestuario", name: "Vestuário" },
      startingPriceCents: 6990,
    }),
    images: [],
    options: [],
    variants: [variant("v-unica", [])],
    permiteMaisDeUmaUnidade: false,
    limitePorPedido: null,
    ...overrides,
  };
}

/** Camiseta com Cor e Tamanho: Preta·M (poucas unidades), Preta·G (esgotada), Branca·M e Branca·G disponíveis. */
export function camisetaComOpcoes(overrides: Partial<ClientShopProductDetail> = {}) {
  return detail({
    images: [image("img-1", 0), image("img-2", 1), image("img-3", 2)],
    originalPriceCents: 8990,
    options: [
      {
        id: "o-cor",
        name: "Cor",
        values: [
          { id: "val-preta", value: "Preta" },
          { id: "val-branca", value: "Branca" },
        ],
      },
      {
        id: "o-tam",
        name: "Tamanho",
        values: [
          { id: "val-m", value: "M" },
          { id: "val-g", value: "G" },
        ],
      },
    ],
    variants: [
      variant("v-preta-m", ["Preta", "M"], { availability: "POUCAS_UNIDADES" }),
      variant("v-preta-g", ["Preta", "G"], { availability: "ESGOTADO" }),
      variant("v-branca-m", ["Branca", "M"]),
      variant("v-branca-g", ["Branca", "G"]),
    ],
    permiteMaisDeUmaUnidade: true,
    limitePorPedido: 3,
    ...overrides,
  });
}

interface Catalog {
  products?: ClientShopProduct[];
  categories?: ClientShopCategory[];
  details?: ClientShopProductDetail[];
}

/** Sessão de cliente e as rotas de leitura da loja (a foto responde com 3 bytes). */
export function mockLoja({ products = [], categories = [], details = [] }: Catalog = {}) {
  server.use(
    http.post("/api/auth/refresh", () =>
      HttpResponse.json({
        accessToken: "token-de-teste",
        user: {
          id: CLIENT_ID,
          email: "cliente@fitburn.local",
          fullName: "Cliente de Teste",
          status: "ACTIVE",
          profile: { id: "profile-cliente", name: "Cliente" },
          permissions: [],
          onboardingPending: [],
        },
      }),
    ),
    http.get("/api/shop/products", ({ request }) => {
      const categoryId = new URL(request.url).searchParams.get("categoryId");
      return HttpResponse.json(
        categoryId ? products.filter((item) => item.category?.id === categoryId) : products,
      );
    }),
    http.get("/api/shop/products/:id", ({ params }) => {
      const found = details.find((item) => item.id === params.id);
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ code: "NOT_FOUND", message: "Produto não encontrado." }, { status: 404 });
    }),
    http.get("/api/shop/categories", () => HttpResponse.json(categories)),
    http.get("/api/shop/product-images/:id", () =>
      new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } }),
    ),
  );
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;
}

export function renderLoja(path: string) {
  let objectUrls = 0;
  URL.createObjectURL = vi.fn(() => `blob:foto-${++objectUrls}`);
  URL.revokeObjectURL = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
            <LocationProbe />
          </MemoryRouter>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
