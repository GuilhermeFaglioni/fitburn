import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  adminShopOrderSchema,
  pendingShopOrdersCountSchema,
  shopOrderSchema,
  type AdminShopOrder,
  type PendingShopOrdersCount,
  type ShopOrder,
  type ShopOrderStatus,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

/** Fila de pedidos da equipe (L7, #200): lista com filtros, contagem de aguardando e as três transições. */

/** Status da lista: vazio = todos. */
export type AdminOrderStatusFilter = ShopOrderStatus | "";

/** Filtros da fila; `from`/`to` são datas locais da academia ("YYYY-MM-DD", inclusivas), vazio = sem limite. */
export interface AdminOrderFilters {
  q: string;
  status: AdminOrderStatusFilter;
  from: string;
  to: string;
}

export function hasAdminOrderFilters(filters: AdminOrderFilters): boolean {
  return filters.q.trim() !== "" || filters.status !== "" || filters.from !== "" || filters.to !== "";
}

export async function listAdminOrders(filters: AdminOrderFilters): Promise<AdminShopOrder[]> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  const response = await authFetch(`/api/shop/admin/orders${query ? `?${query}` : ""}`);
  return z.array(adminShopOrderSchema).parse(await parseOrThrow(response));
}

export async function getPendingOrdersCount(): Promise<PendingShopOrdersCount> {
  const response = await authFetch("/api/shop/admin/orders/pending-count");
  return pendingShopOrdersCountSchema.parse(await parseOrThrow(response));
}

async function transitionOrder(id: string, action: "approve" | "reject" | "deliver", body?: unknown): Promise<ShopOrder> {
  const response = await authFetch(`/api/shop/admin/orders/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  return shopOrderSchema.parse(await parseOrThrow(response));
}

export const adminOrderKeys = {
  all: ["shop-admin-orders"] as const,
  list: (filters: AdminOrderFilters) => ["shop-admin-orders", "list", filters] as const,
  pendingCount: ["shop-admin-orders", "pending-count"] as const,
};

export function useAdminOrders(filters: AdminOrderFilters) {
  return useQuery({
    queryKey: adminOrderKeys.list(filters),
    queryFn: () => listAdminOrders(filters),
    // A lista não pisca vazia a cada tecla ou filtro: mostra a anterior até a nova chegar.
    placeholderData: keepPreviousData,
  });
}

/** `enabled`: só quem tem Ver da Loja pergunta (a API recusa os demais). */
export function usePendingOrdersCount(enabled = true) {
  return useQuery({ queryKey: adminOrderKeys.pendingCount, queryFn: getPendingOrdersCount, enabled });
}

/**
 * Toda transição recarrega a fila e a contagem, com sucesso ou não: um erro de transição inválida quer dizer que o
 * pedido mudou de status por outro caminho, e a lista precisa mostrar o status atual.
 */
function useOrderTransition<Input>(run: (input: Input) => Promise<ShopOrder>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminOrderKeys.all }),
  });
}

export function useApproveOrder() {
  return useOrderTransition((id: string) => transitionOrder(id, "approve"));
}

export function useRejectOrder() {
  return useOrderTransition(({ id, reason }: { id: string; reason: string }) =>
    transitionOrder(id, "reject", reason.trim() ? { reason: reason.trim() } : {}),
  );
}

export function useDeliverOrder() {
  return useOrderTransition((id: string) => transitionOrder(id, "deliver"));
}
