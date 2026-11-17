import { z } from "zod";
import { localDateSchema } from "./agenda.js";

const orderQuantitySchema = z.number().int().min(1, "A quantidade mínima é 1.").max(99);

export const createShopOrderRequestSchema = z.object({
  items: z.array(z.object({ variantId: z.uuid(), quantity: orderQuantitySchema })).min(1).max(50)
    .superRefine((items, ctx) => {
      const ids = new Set<string>();
      items.forEach((item, index) => {
        if (ids.has(item.variantId)) {
          ctx.addIssue({ code: "custom", message: "A variação não pode aparecer mais de uma vez.", path: [index, "variantId"] });
        }
        ids.add(item.variantId);
      });
    }),
  observation: z.string().trim().max(500).nullable().optional(),
});
export type CreateShopOrderRequest = z.infer<typeof createShopOrderRequestSchema>;

export const shopOrderStatusSchema = z.enum([
  "AGUARDANDO_APROVACAO", "APROVADO", "RECUSADO", "ENTREGUE", "CANCELADO",
]);
export type ShopOrderStatus = z.infer<typeof shopOrderStatusSchema>;

export const shopOrderItemSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  options: z.array(z.object({ name: z.string(), value: z.string() })),
  unitPriceCents: z.number().int(),
  quantity: z.number().int().positive(),
  subtotalCents: z.number().int(),
});

export const shopOrderEventSchema = z.object({
  id: z.string(),
  fromStatus: shopOrderStatusSchema.nullable(),
  toStatus: shopOrderStatusSchema,
  actorId: z.string(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const shopOrderSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  status: shopOrderStatusSchema,
  observation: z.string().nullable(),
  totalCents: z.number().int(),
  createdAt: z.string().datetime(),
  items: z.array(shopOrderItemSchema),
  events: z.array(shopOrderEventSchema),
});
export type ShopOrder = z.infer<typeof shopOrderSchema>;

/** Pedido na visão da equipe; identifica o cliente sem expor dados adicionais. */
export const adminShopOrderSchema = shopOrderSchema.extend({
  client: z.object({ id: z.string(), fullName: z.string() }),
});
export type AdminShopOrder = z.infer<typeof adminShopOrderSchema>;

/** Filtros administrativos; `from` e `to` são datas locais inclusivas de criação. */
export const listAdminShopOrdersQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    status: shopOrderStatusSchema.optional(),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "O período é inválido: a data inicial vem depois da final.",
    path: ["to"],
  });
export type ListAdminShopOrdersQuery = z.infer<typeof listAdminShopOrdersQuerySchema>;

/** Motivo opcional da recusa, registrado como nota no evento da transição. */
export const rejectShopOrderRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type RejectShopOrderRequest = z.infer<typeof rejectShopOrderRequestSchema>;

/** Quantidade de pedidos aguardando decisão da equipe. */
export const pendingShopOrdersCountSchema = z.object({ count: z.number().int().nonnegative() });
export type PendingShopOrdersCount = z.infer<typeof pendingShopOrdersCountSchema>;

/** Resposta mínima para avisar o cliente sobre retirada de pedido aprovado. */
export const shopOrderApprovalNoticeSchema = z.object({ number: z.number().int().positive().nullable() });
export type ShopOrderApprovalNotice = z.infer<typeof shopOrderApprovalNoticeSchema>;
