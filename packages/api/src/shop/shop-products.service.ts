import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  type CreateShopProductRequest,
  type ListShopProductsQuery,
  type SetShopProductOptionsRequest,
  type ShopProduct,
  type ShopProductDetail,
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
import { effectivePriceCents } from "./shop-pricing.js";
import { planVariants, valuesOfVariant } from "./shop-variants.js";

/** Quantos produtos podem estar em destaque no Início ao mesmo tempo (não excluídos). */
const FEATURED_LIMIT = 3;

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  options: {
    orderBy: { position: "asc" },
    include: { values: { orderBy: { position: "asc" } } },
  },
  variants: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
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

  /** Produto com opções e variações (sem as descontinuadas), para a tela de edição. */
  async get(id: string, requester: ScopedRequester): Promise<ShopProductDetail> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return toShopProductDetail(await findActiveOrThrow(this.prisma, id));
  }

  /**
   * Cria o produto numa transação. Sem opções, a variação única com o estoque (L1).
   * Com opções, as opções e o produto cartesiano de variações (estoque 0, salvo as
   * sobreposições enviadas). As regras de variação são checadas antes de qualquer escrita.
   */
  async create(input: CreateShopProductRequest, requester: ScopedRequester): Promise<ShopProduct> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    assertSaleRules({
      priceCents: input.priceCents,
      promoPriceCents: input.promoPriceCents,
      permiteMaisDeUmaUnidade: input.permiteMaisDeUmaUnidade,
      limitePorPedido: input.limitePorPedido,
    });

    const options = input.options ?? [];
    const variants =
      options.length > 0
        ? planVariants(options, input.variants).map((plan) => ({
            label: plan.label,
            combinationKey: plan.key,
            position: plan.position,
            stock: plan.override?.stock ?? 0,
            priceCents: plan.override?.priceCents ?? null,
            ativa: plan.override?.ativa ?? true,
          }))
        : [{ label: null, stock: input.stock, ativa: true }];

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
          options: {
            create: options.map((option, position) => ({
              name: option.name,
              position,
              values: {
                create: option.values.map((value, valuePosition) => ({
                  value,
                  position: valuePosition,
                })),
              },
            })),
          },
          variants: { create: variants },
        },
        include: PRODUCT_INCLUDE,
      });
    });
    return toShopProduct(created);
  }

  /**
   * Grava as opções e as variações de uma vez. Mesma ordem de travamento da L1
   * (produto), e a leitura e a escrita ficam sob o lock. As opções são recriadas e
   * as variações são reconciliadas pela chave de combinação: a que continua mantém
   * estoque, preço próprio e ativa; a que volta é reativada com o estoque que tinha;
   * a nova nasce com estoque 0; a que sai é desativada e marcada descontinuada.
   */
  async setOptions(
    id: string,
    input: SetShopProductOptionsRequest,
    requester: ScopedRequester,
  ): Promise<ShopProductDetail> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockProductRow(tx, id);
      const current = await findActiveOrThrow(tx, id);
      const plans = planVariants(input.options, input.variants);
      const wanted = new Set(plans.map((plan) => plan.key));

      await tx.productOption.deleteMany({ where: { productId: id } });
      for (const [position, option] of input.options.entries()) {
        await tx.productOption.create({
          data: {
            productId: id,
            name: option.name,
            position,
            values: {
              create: option.values.map((value, valuePosition) => ({
                value,
                position: valuePosition,
              })),
            },
          },
        });
      }

      for (const variant of current.variants) {
        if (!wanted.has(variant.combinationKey) && !variant.descontinuada) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { descontinuada: true, ativa: false },
          });
        }
      }

      const existing = new Map(current.variants.map((variant) => [variant.combinationKey, variant]));
      for (const plan of plans) {
        const row = existing.get(plan.key);
        const override = plan.override;
        if (row) {
          await tx.productVariant.update({
            where: { id: row.id },
            data: {
              label: plan.label,
              position: plan.position,
              descontinuada: false,
              stock: override?.stock ?? row.stock,
              priceCents: override?.priceCents !== undefined ? override.priceCents : row.priceCents,
              ativa: override?.ativa ?? (row.descontinuada ? true : row.ativa),
            },
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId: id,
              combinationKey: plan.key,
              label: plan.label,
              position: plan.position,
              stock: override?.stock ?? 0,
              priceCents: override?.priceCents ?? null,
              ativa: override?.ativa ?? true,
            },
          });
        }
      }

      return tx.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_INCLUDE });
    });
    return toShopProductDetail(updated);
  }

  /**
   * Atualização parcial. A linha do produto é travada antes da leitura: leitura,
   * regras de venda, destaque e escrita ficam serializadas por produto. Ordem de
   * travamento (sempre a mesma, evita deadlock): linha do produto → categoria →
   * destaque. Só grava o que o corpo trouxe (e o limite, quando a regra o muda).
   */
  async update(
    id: string,
    input: UpdateShopProductRequest,
    requester: ScopedRequester,
  ): Promise<ShopProduct> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockProductRow(tx, id);
      const current = await findActiveOrThrow(tx, id);
      if (input.stock !== undefined && current.options.length > 0) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          "Defina o estoque por variação.",
          ErrorStatus.VALIDATION,
        );
      }
      if (input.categoryId) await lockAndAssertCategory(tx, input.categoryId);

      const next = mergeSaleState(current, input);
      assertSaleRules(next);
      if (input.destaque === true && !current.destaque) await assertFeaturedSlot(tx);

      const limitChanges =
        input.limitePorPedido !== undefined || input.permiteMaisDeUmaUnidade === false;
      await tx.product.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description === undefined ? undefined : input.description || null,
          categoryId: input.categoryId,
          priceCents: input.priceCents,
          promoPriceCents: input.promoPriceCents,
          visivel: input.visivel,
          destaque: input.destaque,
          permiteMaisDeUmaUnidade: input.permiteMaisDeUmaUnidade,
          limitePorPedido: limitChanges ? next.limitePorPedido : undefined,
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

/**
 * Trava a linha do produto até o fim da transação (FOR UPDATE). Chamada antes de
 * ler o estado, para que outra atualização ou exclusão do mesmo produto espere.
 * Se a linha não existir, a leitura seguinte devolve 404.
 */
async function lockProductRow(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
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

/**
 * Produto simples guarda o estoque na variação única (chave ""). Só o estoque muda:
 * se ela estiver desativada, continua desativada. Se não existir, é criada.
 * Só vale sem opções (a API já recusa o resto).
 */
async function setSingleVariantStock(
  tx: Prisma.TransactionClient,
  product: ProductRow,
  stock: number,
): Promise<void> {
  const single = product.variants.find((candidate) => candidate.combinationKey === "");
  if (single) {
    await tx.productVariant.update({ where: { id: single.id }, data: { stock } });
  } else {
    await tx.productVariant.create({
      data: { productId: product.id, label: null, stock, ativa: true },
    });
  }
}

/** Variações não descontinuadas contam; estoque e rupturas olham só as ativas. */
function toShopProduct(row: ProductRow): ShopProduct {
  const live = row.variants.filter((variant) => !variant.descontinuada);
  const active = live.filter((variant) => variant.ativa);
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
    variantCount: live.length,
    stock: active.reduce((total, variant) => total + variant.stock, 0),
    soldOutVariantCount: active.filter((variant) => variant.stock === 0).length,
    createdAt: row.createdAt.toISOString(),
  };
}

function toShopProductDetail(row: ProductRow): ShopProductDetail {
  return {
    ...toShopProduct(row),
    options: row.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((value) => ({ id: value.id, value: value.value })),
    })),
    variants: row.variants
      .filter((variant) => !variant.descontinuada)
      .map((variant) => ({
        id: variant.id,
        label: variant.label,
        values: valuesOfVariant(variant.combinationKey, row.options),
        stock: variant.stock,
        priceCents: variant.priceCents,
        effectivePriceCents: effectivePriceCents({
          priceCents: row.priceCents,
          promoPriceCents: row.promoPriceCents,
          variantPriceCents: variant.priceCents,
        }),
        ativa: variant.ativa,
      })),
  };
}
