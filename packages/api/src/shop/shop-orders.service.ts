import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, ShopOrderStatus } from "@prisma/client";
import {
  addDays,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
  type CreateShopOrderRequest,
  type AdminShopOrder,
  type ListAdminShopOrdersQuery,
  type PendingShopOrdersCount,
  type ShopOrderApprovalNotice,
  type ShopOrder,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { DomainError } from "../common/errors/domain-error.js";
import { assertIsActiveClient } from "../permissions/client-scope.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { replay, runIdempotent } from "../reservations/idempotency.js";
import { effectivePriceCents } from "./shop-pricing.js";
import { valuesOfVariant } from "./shop-variants.js";
import { SHOP_FULL_SCOPE_MESSAGE } from "./shop-constants.js";

type Tx = Prisma.TransactionClient;
const ORDER_INCLUDE = {
  items: { orderBy: { id: "asc" as const } },
  events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
};
const ADMIN_ORDER_INCLUDE = {
  ...ORDER_INCLUDE,
  client: { select: { id: true, fullName: true } },
} satisfies Prisma.ShopOrderInclude;

@Injectable()
export class ShopOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clientId: string, input: CreateShopOrderRequest, key: string): Promise<ShopOrder> {
    await assertIsActiveClient(this.prisma, clientId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const variantIds = input.items.map((item) => item.variantId).sort();
      await this.lockVariants(tx, variantIds);
      await lockAdvisory(tx, `shop-order-client:${clientId}`);
      return runIdempotent(
        tx,
        clientId,
        key,
        { operation: "shop-order-create", items: input.items, observation: input.observation },
        HttpStatus.CREATED,
        async () => this.createLocked(tx, clientId, input),
      );
    });
    return replay(outcome);
  }

  async listMine(clientId: string): Promise<ShopOrder[]> {
    await assertIsActiveClient(this.prisma, clientId);
    const rows = await this.prisma.shopOrder.findMany({
      where: { clientId }, include: ORDER_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toShopOrder);
  }

  async listAdmin(query: ListAdminShopOrdersQuery, requester: ScopedRequester): Promise<AdminShopOrder[]> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = gymDateTimeToUtc(query.from, "00:00");
    if (query.to) createdAt.lt = gymDateTimeToUtc(addDays(query.to, 1), "00:00");

    const matchingNumbers = query.q && /^\d+$/.test(query.q)
      ? (await this.prisma.$queryRaw<Array<{ number: number }>>`
          SELECT number FROM shop_orders WHERE number::text LIKE ${`%${query.q}%`}
        `).map(({ number }) => number)
      : [];
    const rows = await this.prisma.shopOrder.findMany({
      where: {
        status: query.status,
        ...(query.from || query.to ? { createdAt } : {}),
        ...(query.q ? {
          OR: [
            { number: { in: matchingNumbers } },
            { client: { fullName: { contains: query.q, mode: "insensitive" } } },
          ],
        } : {}),
      },
      include: ADMIN_ORDER_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({ ...toShopOrder(row), client: row.client }));
  }

  async pendingCount(requester: ScopedRequester): Promise<PendingShopOrdersCount> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return {
      count: await this.prisma.shopOrder.count({ where: { status: ShopOrderStatus.AGUARDANDO_APROVACAO } }),
    };
  }

  async approve(id: string, actorId: string, requester: ScopedRequester): Promise<ShopOrder> {
    return this.transition(id, ShopOrderStatus.APROVADO, actorId, requester);
  }

  async reject(id: string, actorId: string, reason: string | undefined, requester: ScopedRequester): Promise<ShopOrder> {
    return this.transition(id, ShopOrderStatus.RECUSADO, actorId, requester, reason);
  }

  async deliver(id: string, actorId: string, requester: ScopedRequester): Promise<ShopOrder> {
    return this.transition(id, ShopOrderStatus.ENTREGUE, actorId, requester);
  }

  async approvalNotice(clientId: string): Promise<ShopOrderApprovalNotice> {
    await assertIsActiveClient(this.prisma, clientId);
    const row = await this.prisma.shopOrder.findFirst({
      where: { clientId, status: ShopOrderStatus.APROVADO },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return { number: row?.number ?? null };
  }

  async getMine(clientId: string, id: string): Promise<ShopOrder> {
    await assertIsActiveClient(this.prisma, clientId);
    const row = await this.prisma.shopOrder.findFirst({ where: { id, clientId }, include: ORDER_INCLUDE });
    if (!row) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, "Pedido não encontrado.", ErrorStatus.NOT_FOUND);
    return toShopOrder(row);
  }

  async cancel(clientId: string, id: string): Promise<ShopOrder> {
    await assertIsActiveClient(this.prisma, clientId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM shop_orders WHERE id = ${id} AND "clientId" = ${clientId} FOR UPDATE`;
      const order = await tx.shopOrder.findFirst({ where: { id, clientId }, include: { items: true } });
      if (!order) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, "Pedido não encontrado.", ErrorStatus.NOT_FOUND);
      if (order.status !== ShopOrderStatus.AGUARDANDO_APROVACAO) {
        throw new DomainError(ErrorCode.ORDER_INVALID_TRANSITION, "Só é possível cancelar um pedido que aguarda aprovação.", ErrorStatus.CONFLICT);
      }
      await this.releaseInventory(tx, order.items.map(({ variantId, quantity }) => ({ variantId, quantity })));
      await tx.shopOrder.update({ where: { id }, data: { status: ShopOrderStatus.CANCELADO } });
      await tx.shopOrderEvent.create({ data: { orderId: id, fromStatus: order.status, toStatus: ShopOrderStatus.CANCELADO, actorId: clientId } });
      return toShopOrder(await tx.shopOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE }));
    });
  }

  /** Toda transição administrativa trava o pedido; recusa também devolve estoque no mesmo commit. */
  private async transition(
    id: string,
    status: ShopOrderStatus,
    actorId: string,
    requester: ScopedRequester,
    reason?: string,
  ): Promise<ShopOrder> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM shop_orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.shopOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, "Pedido não encontrado.", ErrorStatus.NOT_FOUND);
      const expectedStatus = status === ShopOrderStatus.ENTREGUE
        ? ShopOrderStatus.APROVADO
        : ShopOrderStatus.AGUARDANDO_APROVACAO;
      if (order.status !== expectedStatus) {
        throw new DomainError(
          ErrorCode.ORDER_INVALID_TRANSITION,
          status === ShopOrderStatus.ENTREGUE
            ? "Só é possível entregar um pedido aprovado."
            : "Só é possível aprovar ou recusar um pedido que aguarda aprovação.",
          ErrorStatus.CONFLICT,
        );
      }
      if (status === ShopOrderStatus.RECUSADO) {
        await this.releaseInventory(tx, order.items.map(({ variantId, quantity }) => ({ variantId, quantity })));
      }
      await tx.shopOrder.update({ where: { id }, data: { status } });
      await tx.shopOrderEvent.create({ data: { orderId: id, fromStatus: order.status, toStatus: status, actorId, note: reason || null } });
      return toShopOrder(await tx.shopOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE }));
    });
  }

  private async createLocked(tx: Tx, clientId: string, input: CreateShopOrderRequest): Promise<ShopOrder> {
    const ids = input.items.map((item) => item.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: ids } },
      include: { product: { include: { options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } } } } },
    });
    if (variants.length !== ids.length || variants.some(({ ativa, descontinuada, product }) => !ativa || descontinuada || !product.visivel || product.excluidoEm !== null)) {
      throw new DomainError(ErrorCode.PRODUCT_NOT_AVAILABLE, "Um ou mais produtos não estão mais disponíveis.", ErrorStatus.CONFLICT);
    }

    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const countsByProduct = new Map<string, number>();
    for (const item of input.items) {
      const variant = byId.get(item.variantId)!;
      countsByProduct.set(variant.productId, (countsByProduct.get(variant.productId) ?? 0) + item.quantity);
    }
    for (const [productId, quantity] of countsByProduct) {
      const product = variants.find((variant) => variant.productId === productId)!.product;
      const limit = product.permiteMaisDeUmaUnidade ? (product.limitePorPedido ?? 99) : 1;
      if (quantity > limit) {
        throw new DomainError(ErrorCode.PRODUCT_ORDER_LIMIT_EXCEEDED, `A quantidade máxima deste produto por pedido é ${limit}.`, ErrorStatus.UNPROCESSABLE, { productId, limit, requestedQuantity: quantity });
      }
    }

    const stockByItem = input.items.map((item) => {
      const variant = byId.get(item.variantId)!;
      return { variantId: item.variantId, requestedQuantity: item.quantity, availableQuantity: variant.stock };
    });
    if (stockByItem.some(({ requestedQuantity, availableQuantity }) => requestedQuantity > availableQuantity)) {
      throw new DomainError(ErrorCode.SHOP_STOCK_CONFLICT, "O estoque mudou. Ajuste as quantidades do carrinho.", ErrorStatus.CONFLICT, { items: stockByItem });
    }

    const prepared = input.items.map((item) => {
      const variant = byId.get(item.variantId)!;
      const product = variant.product;
      const values = valuesOfVariant(variant.combinationKey, product.options);
      const options = product.options.map((option, index) => ({ name: option.name, value: values[index] ?? "" }));
      const unitPriceCents = effectivePriceCents({ priceCents: product.priceCents, promoPriceCents: product.promoPriceCents, variantPriceCents: variant.priceCents });
      return { item, variant, options, unitPriceCents, subtotalCents: unitPriceCents * item.quantity };
    });
    const totalCents = prepared.reduce((sum, item) => sum + item.subtotalCents, 0);

    await tx.shopOrderCounter.upsert({ where: { id: 1 }, create: { id: 1, lastNumber: 0 }, update: {} });
    const numberRows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
      UPDATE shop_order_counters SET "lastNumber" = "lastNumber" + 1 WHERE id = 1 RETURNING "lastNumber"
    `;
    const number = numberRows[0]?.lastNumber;
    if (number === undefined) throw new Error("O contador de pedidos não foi inicializado.");

    for (const { item } of prepared) {
      await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } });
    }
    const order = await tx.shopOrder.create({
      data: {
        number, clientId, totalCents, observation: input.observation ?? null,
        items: { create: prepared.map(({ item, variant, options, unitPriceCents, subtotalCents }) => ({
          variantId: variant.id, productName: variant.product.name, variantLabel: variant.label,
          optionsSnapshot: options, unitPriceCents, quantity: item.quantity, subtotalCents,
        })) },
        events: { create: { fromStatus: null, toStatus: ShopOrderStatus.AGUARDANDO_APROVACAO, actorId: clientId } },
      }, include: ORDER_INCLUDE,
    });
    return toShopOrder(order);
  }

  private async releaseInventory(tx: Tx, items: { variantId: string; quantity: number }[]): Promise<void> {
    await this.lockVariants(tx, items.map((item) => item.variantId).sort());
    for (const { variantId, quantity } of items) {
      await tx.productVariant.update({ where: { id: variantId }, data: { stock: { increment: quantity } } });
    }
  }

  private async lockVariants(tx: Tx, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await tx.$queryRaw`SELECT id FROM product_variants WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  }
}

function toShopOrder(row: Prisma.ShopOrderGetPayload<{ include: typeof ORDER_INCLUDE }>): ShopOrder {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    observation: row.observation,
    totalCents: row.totalCents,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id, variantId: item.variantId, productName: item.productName,
      variantLabel: item.variantLabel,
      options: item.optionsSnapshot as { name: string; value: string }[],
      unitPriceCents: item.unitPriceCents, quantity: item.quantity, subtotalCents: item.subtotalCents,
    })),
    events: row.events.map((event) => ({
      id: event.id, fromStatus: event.fromStatus, toStatus: event.toStatus,
      actorId: event.actorId, note: event.note, createdAt: event.createdAt.toISOString(),
    })),
  };
}
