import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ErrorCode,
  IDEMPOTENCY_KEY_HEADER,
  shopOrderApprovalNoticeSchema,
  shopOrderSchema,
  type CreateShopOrderRequest,
  type ShopOrder,
  type ShopOrderApprovalNotice,
  type ShopOrderStatus,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { ApiError, parseOrThrow } from "../auth/api";

/**
 * Pedido da loja pelo cliente (L5, #196). `idempotencyKey`: uma por tentativa de compra, reenviada em toda nova
 * tentativa da mesma compra, para um toque repetido ou uma rede instável nunca criarem dois pedidos.
 */
export async function createShopOrder(
  request: CreateShopOrderRequest,
  idempotencyKey: string,
): Promise<ShopOrder> {
  const response = await authFetch("/api/shop/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify(request),
  });
  return shopOrderSchema.parse(await parseOrThrow(response));
}

const stockConflictSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string(),
      requestedQuantity: z.number().int(),
      availableQuantity: z.number().int().nonnegative(),
    }),
  ),
});
export type StockConflictItem = z.infer<typeof stockConflictSchema>["items"][number];

/** Os itens do conflito de estoque (409 `SHOP_STOCK_CONFLICT`) com a quantidade disponível; `null` para outro erro. */
export function stockConflictOf(error: unknown): StockConflictItem[] | null {
  if (!(error instanceof ApiError) || error.code !== ErrorCode.SHOP_STOCK_CONFLICT) return null;
  const parsed = stockConflictSchema.safeParse(error.details);
  return parsed.success ? parsed.data.items : null;
}

/** "#0043": o número do pedido como a academia o chama. */
export function formatOrderNumber(number: number): string {
  return `#${String(number).padStart(4, "0")}`;
}

/** Nome de cada status do pedido, como o cliente o lê. */
export const ORDER_STATUS_LABEL: Record<ShopOrderStatus, string> = {
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

/** Meus pedidos (L6, #199): lista, detalhe, cancelamento e o aviso de pedido aprovado do Início. */

export async function listMyOrders(): Promise<ShopOrder[]> {
  const response = await authFetch("/api/shop/orders");
  return z.array(shopOrderSchema).parse(await parseOrThrow(response));
}

export async function getMyOrder(id: string): Promise<ShopOrder> {
  const response = await authFetch(`/api/shop/orders/${encodeURIComponent(id)}`);
  return shopOrderSchema.parse(await parseOrThrow(response));
}

/** Só vale para pedido aguardando aprovação; fora disso a API recusa com a mensagem do motivo. */
export async function cancelMyOrder(id: string): Promise<ShopOrder> {
  const response = await authFetch(`/api/shop/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  return shopOrderSchema.parse(await parseOrThrow(response));
}

/** O pedido aprovado mais recente do cliente (ainda a retirar), ou `{ number: null }`. */
export async function getApprovalNotice(): Promise<ShopOrderApprovalNotice> {
  const response = await authFetch("/api/shop/orders/approval-notice");
  return shopOrderApprovalNoticeSchema.parse(await parseOrThrow(response));
}

export const orderKeys = {
  all: ["my-orders"] as const,
  list: ["my-orders", "list"] as const,
  detail: (id: string) => ["my-orders", "detail", id] as const,
  approvalNotice: ["my-orders", "approval-notice"] as const,
};

export function useMyOrders() {
  return useQuery({ queryKey: orderKeys.list, queryFn: listMyOrders });
}

export function useMyOrder(id: string) {
  return useQuery({ queryKey: orderKeys.detail(id), queryFn: () => getMyOrder(id) });
}

export function useApprovalNotice() {
  return useQuery({ queryKey: orderKeys.approvalNotice, queryFn: getApprovalNotice });
}
