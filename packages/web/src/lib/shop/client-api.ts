import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  clientShopCategorySchema,
  clientShopProductDetailSchema,
  clientShopProductSchema,
  type ClientShopCategory,
  type ClientShopProduct,
  type ClientShopProductDetail,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

/** Leitura da Loja pelo cliente (L4, #193): catálogo, detalhe e categorias, sem estoque exato. */

export async function listClientProducts(categoryId: string): Promise<ClientShopProduct[]> {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
  const response = await authFetch(`/api/shop/products${query}`);
  return z.array(clientShopProductSchema).parse(await parseOrThrow(response));
}

export async function getClientProduct(id: string): Promise<ClientShopProductDetail> {
  const response = await authFetch(`/api/shop/products/${encodeURIComponent(id)}`);
  return clientShopProductDetailSchema.parse(await parseOrThrow(response));
}

export async function listClientCategories(): Promise<ClientShopCategory[]> {
  const response = await authFetch("/api/shop/categories");
  return z.array(clientShopCategorySchema).parse(await parseOrThrow(response));
}

/** Fora da raiz `shop` do admin: gravar na loja (equipe) não depende destas chaves. */
export const clientShopKeys = {
  products: (categoryId: string) => ["client-shop", "products", categoryId] as const,
  product: (id: string) => ["client-shop", "product", id] as const,
  categories: ["client-shop", "categories"] as const,
};

/** Mantém a grade anterior na tela enquanto o filtro novo carrega (sem piscar o estado de carregando). */
export function useClientProducts(categoryId: string) {
  return useQuery({
    queryKey: clientShopKeys.products(categoryId),
    queryFn: () => listClientProducts(categoryId),
    placeholderData: keepPreviousData,
  });
}

export function useClientProduct(id: string) {
  return useQuery({ queryKey: clientShopKeys.product(id), queryFn: () => getClientProduct(id) });
}

export function useClientCategories() {
  return useQuery({ queryKey: clientShopKeys.categories, queryFn: listClientCategories });
}
