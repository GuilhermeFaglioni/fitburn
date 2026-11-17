import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  shopCategorySchema,
  shopProductDetailSchema,
  shopProductImageSchema,
  shopProductSchema,
  type CreateShopProductRequest,
  type SetShopProductOptionsRequest,
  type ShopCategory,
  type ShopProduct,
  type ShopProductDetail,
  type ShopProductImage,
  type UpdateShopProductRequest,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type ShopVisibilityFilter = "all" | "visible" | "hidden";

/** Filtros da lista de produtos; vazio/`all` = sem filtro (não vão na URL). */
export interface ShopProductFilters {
  q: string;
  categoryId: string;
  visibility: ShopVisibilityFilter;
}

export const NO_PRODUCT_FILTERS: ShopProductFilters = { q: "", categoryId: "", visibility: "all" };

export function hasProductFilters(filters: ShopProductFilters): boolean {
  return filters.q.trim() !== "" || filters.categoryId !== "" || filters.visibility !== "all";
}

// ---- Categorias (/api/shop/admin/categories) ----

export async function listShopCategories(): Promise<ShopCategory[]> {
  const response = await authFetch("/api/shop/admin/categories");
  return z.array(shopCategorySchema).parse(await parseOrThrow(response));
}

export async function createShopCategory(name: string): Promise<ShopCategory> {
  const response = await authFetch("/api/shop/admin/categories", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
  return shopCategorySchema.parse(await parseOrThrow(response));
}

export async function renameShopCategory(id: string, name: string): Promise<ShopCategory> {
  const response = await authFetch(`/api/shop/admin/categories/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
  return shopCategorySchema.parse(await parseOrThrow(response));
}

/** `ids`: a lista completa das categorias, na nova ordem. */
export async function reorderShopCategories(ids: string[]): Promise<ShopCategory[]> {
  const response = await authFetch("/api/shop/admin/categories/order", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ids }),
  });
  return z.array(shopCategorySchema).parse(await parseOrThrow(response));
}

export async function deleteShopCategory(id: string): Promise<void> {
  const response = await authFetch(`/api/shop/admin/categories/${id}`, { method: "DELETE" });
  await parseOrThrow(response);
}

// ---- Produtos (/api/shop/admin/products) ----

export async function listShopProducts(filters: ShopProductFilters): Promise<ShopProduct[]> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.visibility !== "all") params.set("visibility", filters.visibility);
  const query = params.toString();
  const response = await authFetch(`/api/shop/admin/products${query ? `?${query}` : ""}`);
  return z.array(shopProductSchema).parse(await parseOrThrow(response));
}

/** Detalhe para a tela de edição: o produto com suas opções e variações (sem as descontinuadas). */
export async function getShopProduct(id: string): Promise<ShopProductDetail> {
  const response = await authFetch(`/api/shop/admin/products/${id}`);
  return shopProductDetailSchema.parse(await parseOrThrow(response));
}

/**
 * Grava as opções e as sobreposições de variação numa chamada. A API recria as opções: os IDs de opção e de valor
 * mudam a cada gravação, então a tela trabalha com o estado devolvido, nunca com IDs guardados.
 */
export async function setShopProductOptions(
  id: string,
  input: SetShopProductOptionsRequest,
): Promise<ShopProductDetail> {
  const response = await authFetch(`/api/shop/admin/products/${id}/options`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return shopProductDetailSchema.parse(await parseOrThrow(response));
}

export async function createShopProduct(input: CreateShopProductRequest): Promise<ShopProduct> {
  const response = await authFetch("/api/shop/admin/products", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return shopProductSchema.parse(await parseOrThrow(response));
}

export async function updateShopProduct(
  id: string,
  input: UpdateShopProductRequest,
): Promise<ShopProduct> {
  const response = await authFetch(`/api/shop/admin/products/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return shopProductSchema.parse(await parseOrThrow(response));
}

export async function deleteShopProduct(id: string): Promise<void> {
  const response = await authFetch(`/api/shop/admin/products/${id}`, { method: "DELETE" });
  await parseOrThrow(response);
}

// ---- Fotos do produto (/api/shop/admin/products/:id/images, /api/shop/product-images/:id) ----

/** Envia a foto já reduzida (`prepareProductImage`): multipart com o arquivo e os metadados que a API confere. */
export async function uploadShopProductImage(productId: string, file: File): Promise<ShopProductImage> {
  const form = new FormData();
  form.set("file", file);
  form.set("mimeType", file.type);
  form.set("sizeBytes", String(file.size));
  const response = await authFetch(`/api/shop/admin/products/${productId}/images`, {
    method: "POST",
    body: form,
  });
  return shopProductImageSchema.parse(await parseOrThrow(response));
}

/**
 * Deixa as fotos na ordem de `imageIds` e a primeira como capa. A API guarda a ordem e a capa em separado (`PUT
 * order` não mexe na capa, `PUT cover` não mexe na ordem), então a capa só é regravada quando a primeira mudou.
 */
export async function arrangeShopProductImages(
  productId: string,
  imageIds: string[],
  currentCoverId: string | undefined,
): Promise<ShopProductImage[]> {
  const base = `/api/shop/admin/products/${productId}/images`;
  let response = await authFetch(`${base}/order`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ imageIds }),
  });
  let images = z.array(shopProductImageSchema).parse(await parseOrThrow(response));
  const [first] = imageIds;
  if (first && first !== currentCoverId) {
    response = await authFetch(`${base}/cover`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ imageId: first }),
    });
    images = z.array(shopProductImageSchema).parse(await parseOrThrow(response));
  }
  return images;
}

export async function deleteShopProductImage(productId: string, imageId: string): Promise<void> {
  const response = await authFetch(`/api/shop/admin/products/${productId}/images/${imageId}`, {
    method: "DELETE",
  });
  await parseOrThrow(response);
}

/** Os bytes da foto: a rota exige o token, então `<img src>` direto não serve. */
export async function fetchShopProductImage(url: string): Promise<Blob> {
  const response = await authFetch(url);
  if (!response.ok) throw new Error(`Foto indisponível (${response.status}).`);
  return response.blob();
}

// ---- React Query ----

export const shopKeys = {
  all: ["shop"] as const,
  products: (filters: ShopProductFilters) => ["shop", "products", filters] as const,
  product: (id: string) => ["shop", "product", id] as const,
  categories: ["shop", "categories"] as const,
  /** Fora da raiz `shop`: a URL é versionada pelo id da foto (imutável), então gravar na loja não a recarrega. */
  image: (url: string) => ["shop-image", url] as const,
};

/** Produtos e categorias dependem uns dos outros (contagem, nome da categoria): toda gravação recarrega tudo da loja. */
function useInvalidateShop() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: shopKeys.all });
}

export function useShopCategories() {
  return useQuery({ queryKey: shopKeys.categories, queryFn: listShopCategories });
}

/** Mantém a lista anterior na tela enquanto um filtro novo carrega (sem piscar o estado de carregando). */
export function useShopProducts(filters: ShopProductFilters) {
  return useQuery({
    queryKey: shopKeys.products(filters),
    queryFn: () => listShopProducts(filters),
    placeholderData: keepPreviousData,
  });
}

export function useShopProduct(id: string) {
  return useQuery({ queryKey: shopKeys.product(id), queryFn: () => getShopProduct(id) });
}

export function useCreateShopProduct() {
  const invalidate = useInvalidateShop();
  return useMutation({ mutationFn: createShopProduct, onSuccess: invalidate });
}

export function useUpdateShopProduct() {
  const invalidate = useInvalidateShop();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateShopProductRequest }) =>
      updateShopProduct(id, input),
    onSuccess: invalidate,
  });
}

export function useSetShopProductOptions() {
  const invalidate = useInvalidateShop();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetShopProductOptionsRequest }) =>
      setShopProductOptions(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteShopProduct() {
  const invalidate = useInvalidateShop();
  return useMutation({ mutationFn: deleteShopProduct, onSuccess: invalidate });
}

export function useCreateShopCategory() {
  const invalidate = useInvalidateShop();
  return useMutation({ mutationFn: createShopCategory, onSuccess: invalidate });
}

export function useRenameShopCategory() {
  const invalidate = useInvalidateShop();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameShopCategory(id, name),
    onSuccess: invalidate,
  });
}

export function useReorderShopCategories() {
  const invalidate = useInvalidateShop();
  return useMutation({ mutationFn: reorderShopCategories, onSuccess: invalidate });
}

export function useDeleteShopCategory() {
  const invalidate = useInvalidateShop();
  return useMutation({ mutationFn: deleteShopCategory, onSuccess: invalidate });
}

export function useUploadShopProductImage() {
  const invalidate = useInvalidateShop();
  return useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) =>
      uploadShopProductImage(productId, file),
    onSuccess: invalidate,
  });
}

export function useArrangeShopProductImages() {
  const invalidate = useInvalidateShop();
  return useMutation({
    mutationFn: ({
      productId,
      imageIds,
      currentCoverId,
    }: {
      productId: string;
      imageIds: string[];
      currentCoverId: string | undefined;
    }) => arrangeShopProductImages(productId, imageIds, currentCoverId),
    // Mesmo com a segunda chamada falhando, a ordem já mudou: recarrega para a tela mostrar o que ficou.
    onSettled: invalidate,
  });
}

export function useDeleteShopProductImage() {
  const invalidate = useInvalidateShop();
  return useMutation({
    mutationFn: ({ productId, imageId }: { productId: string; imageId: string }) =>
      deleteShopProductImage(productId, imageId),
    onSuccess: invalidate,
  });
}

/**
 * Endereço (`blob:`) para o `<img>` de uma foto. Os bytes vêm uma vez por URL (a URL é versionada pelo id, a foto
 * nunca muda) e ficam em cache; cada uso cria e libera o próprio endereço.
 */
export function useShopProductImageSrc(url: string) {
  const query = useQuery({
    queryKey: shopKeys.image(url),
    queryFn: () => fetchShopProductImage(url),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const blob = query.data;
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setSrc(undefined);
    };
  }, [blob]);
  return { src, query };
}
