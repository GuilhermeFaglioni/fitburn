import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  type CreateShopProductRequest,
  type ListShopProductsQuery,
  type ShopProduct,
  type UpdateShopProductRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import {
  SHOP_CATEGORY_LOCK,
  SHOP_FEATURED_LOCK,
  SHOP_FULL_SCOPE_MESSAGE,
} from "./shop-constants.js";

/** Quantos produtos podem estar em destaque no Início ao mesmo tempo (não excluídos). */
const FEATURED_LIMIT = 3;

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  variants: {
    select: { id: true, ativa: true, stock: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

type Db = Prisma.TransactionClient | PrismaService;

/** Campos que as regras de venda olham: sempre o estado final do produto. */
interface SaleState {
  priceCents: number;
  promoPriceCents: number | null;
  permiteMaisDeUmaUnidade: boolean;
  limitePorPedido: number | null;
}

/**
 * Produtos da loja (administração). Produto simples: uma variação única, que
 * guarda o estoque. Exclusão é sempre lógica (`excluidoEm`), e produto excluído
 * some de todas as consultas. No máximo 3 produtos não excluídos em destaque,
 * garantido por lock consultivo na mesma transação da gravação.
 */
@Injectable()
export class ShopProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListShopProductsQuery, requester: ScopedRequester): Promise<ShopProduct[]> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const rows = await this.prisma.product.findMany({
      where: {
        excluidoEm: null,
        categoryId: query.categoryId,
        visivel: visibilityFilter(query.visibility),
        name: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: PRODUCT_INCLUDE,
    });
    return rows.map(toShopProduct);
  }

  async get(id: string, requester: ScopedRequester): Promise<ShopProduct> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return toShopProduct(await findActiveOrThrow(this.prisma, id));
  }

  /** Cria o produto e a variação única (com o estoque) numa transação. */
  async create(input: CreateShopProductRequest, requester: ScopedRequester): Promise<ShopProduct> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    assertSaleRules({
      priceCents: input.priceCents,
      promoPriceCents: input.promoPriceCents,
      permiteMaisDeUmaUnidade: input.permiteMaisDeUmaUnidade,
      limitePorPedido: input.limitePorPedido,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      if (input.categoryId) await lockAndAssertCategory(tx, input.categoryId);
      if (input.destaque) await assertFeaturedSlot(tx);
      return tx.product.create({
        data: {
          name: input.name,
          description: input.description || null,
          categoryId: input.categoryId,
          priceCents: input.priceCents,
          promoPriceCents: input.promoPriceCents,
          visivel: input.visivel,
          destaque: input.destaque,
          permiteMaisDeUmaUnidade: input.permiteMaisDeUmaUnidade,
          limitePorPedido: input.limitePorPedido,
          variants: { create: { label: null, stock: input.stock, ativa: true } },
        },
        include: PRODUCT_INCLUDE,
      });
    });
    return toShopProduct(created);
  }

  /** Atualização parcial. As regras de venda valem para o estado final (salvo mesclado com o corpo). */
  async update(
    id: string,
    input: UpdateShopProductRequest,
    requester: ScopedRequester,
  ): Promise<ShopProduct> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await findActiveOrThrow(tx, id);
      if (input.categoryId) await lockAndAssertCategory(tx, input.categoryId);

      const next = mergeSaleState(current, input);
      assertSaleRules(next);
      if (input.destaque === true && !current.destaque) await assertFeaturedSlot(tx);

      await tx.product.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description === undefined ? undefined : input.description || null,
          categoryId: input.categoryId,
          priceCents: next.priceCents,
          promoPriceCents: next.promoPriceCents,
          visivel: input.visivel,
          destaque: input.destaque,
          permiteMaisDeUmaUnidade: next.permiteMaisDeUmaUnidade,
          limitePorPedido: next.limitePorPedido,
        },
      });
      if (input.stock !== undefined) await setSingleVariantStock(tx, current, input.stock);

      return tx.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_INCLUDE });
    });
    return toShopProduct(updated);
  }

  /** Exclusão lógica: some das consultas, mas a linha e a variação ficam no banco. Sai do destaque. */
  async remove(id: string, requester: ScopedRequester): Promise<void> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const result = await this.prisma.product.updateMany({
      where: { id, excluidoEm: null },
      data: { excluidoEm: new Date(), destaque: false },
    });
    if (result.count === 0) throw notFoundProduct();
  }
}

function visibilityFilter(visibility: ListShopProductsQuery["visibility"]): boolean | undefined {
  if (visibility === "visible") return true;
  if (visibility === "hidden") return false;
  return undefined;
}

async function findActiveOrThrow(db: Db, id: string): Promise<ProductRow> {
  const product = await db.product.findFirst({
    where: { id, excluidoEm: null },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw notFoundProduct();
  return product;
}

function notFoundProduct(): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, "Produto não encontrado.", ErrorStatus.NOT_FOUND);
}

/** Categoria precisa existir; o lock garante que uma exclusão concorrente espere esta gravação. */
async function lockAndAssertCategory(tx: Prisma.TransactionClient, categoryId: string): Promise<void> {
  await lockAdvisory(tx, SHOP_CATEGORY_LOCK);
  const category = await tx.shopCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) {
    throw new DomainError(ErrorCode.NOT_FOUND, "Categoria não encontrada.", ErrorStatus.NOT_FOUND);
  }
}

/** Chamada só quando o produto passa a estar em destaque: conta os atuais sob lock. */
async function assertFeaturedSlot(tx: Prisma.TransactionClient): Promise<void> {
  await lockAdvisory(tx, SHOP_FEATURED_LOCK);
  const featured = await tx.product.count({ where: { destaque: true, excluidoEm: null } });
  if (featured >= FEATURED_LIMIT) {
    throw new DomainError(
      ErrorCode.FEATURED_LIMIT_REACHED,
      "Você já tem 3 produtos em destaque no Início. Desmarque um antes de destacar outro.",
      ErrorStatus.CONFLICT,
    );
  }
}

/** O estado final do produto: o salvo, com o que o corpo do PATCH mudou. */
function mergeSaleState(current: ProductRow, input: UpdateShopProductRequest): SaleState {
  const permiteMaisDeUmaUnidade = input.permiteMaisDeUmaUnidade ?? current.permiteMaisDeUmaUnidade;
  let limitePorPedido: number | null;
  if (input.limitePorPedido !== undefined) {
    limitePorPedido = input.limitePorPedido;
  } else {
    // Desligar "mais de uma unidade" sem mandar limite zera o limite.
    limitePorPedido = permiteMaisDeUmaUnidade ? current.limitePorPedido : null;
  }
  return {
    priceCents: input.priceCents ?? current.priceCents,
    promoPriceCents:
      input.promoPriceCents !== undefined ? input.promoPriceCents : current.promoPriceCents,
    permiteMaisDeUmaUnidade,
    limitePorPedido,
  };
}

function assertSaleRules(state: SaleState): void {
  if (state.promoPriceCents !== null && state.promoPriceCents >= state.priceCents) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      "O preço promocional deve ser menor que o preço.",
      ErrorStatus.VALIDATION,
    );
  }
  if (!state.permiteMaisDeUmaUnidade && state.limitePorPedido !== null) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      "O limite por pedido só vale quando o produto permite mais de uma unidade.",
      ErrorStatus.VALIDATION,
    );
  }
}

/** Produto simples tem uma variação só: atualiza o estoque dela (cria, se por algum motivo não existir). */
async function setSingleVariantStock(
  tx: Prisma.TransactionClient,
  product: ProductRow,
  stock: number,
): Promise<void> {
  const [variant] = product.variants;
  if (variant) {
    await tx.productVariant.update({ where: { id: variant.id }, data: { stock } });
  } else {
    await tx.productVariant.create({
      data: { productId: product.id, label: null, stock, ativa: true },
    });
  }
}

function toShopProduct(row: ProductRow): ShopProduct {
  const active = row.variants.filter((variant) => variant.ativa);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceCents: row.priceCents,
    promoPriceCents: row.promoPriceCents,
    visivel: row.visivel,
    destaque: row.destaque,
    permiteMaisDeUmaUnidade: row.permiteMaisDeUmaUnidade,
    limitePorPedido: row.limitePorPedido,
    variantCount: row.variants.length,
    stock: active.reduce((total, variant) => total + variant.stock, 0),
    soldOutVariantCount: active.filter((variant) => variant.stock === 0).length,
    createdAt: row.createdAt.toISOString(),
  };
}
