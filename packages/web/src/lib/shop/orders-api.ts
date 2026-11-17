import { z } from "zod";
import {
  ErrorCode,
  IDEMPOTENCY_KEY_HEADER,
  shopOrderSchema,
  type CreateShopOrderRequest,
  type ShopOrder,
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
