import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  type CreateShopCategoryRequest,
  type RenameShopCategoryRequest,
  type ReorderShopCategoriesRequest,
  type ShopCategory,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { isUniqueViolation } from "../prisma/unique-violation.js";
import { SHOP_CATEGORY_LOCK, SHOP_FULL_SCOPE_MESSAGE } from "./shop-constants.js";

const CATEGORY_INCLUDE = {
  _count: { select: { products: { where: { excluidoEm: null } } } },
} satisfies Prisma.ShopCategoryInclude;

type CategoryRow = Prisma.ShopCategoryGetPayload<{ include: typeof CATEGORY_INCLUDE }>;

/**
 * Categorias da loja, ordenadas pela posição. Entram no fim (posição = máximo + 1)
 * e são reordenadas pela lista completa de ids. Excluir uma categoria em uso
 * (com produto não excluído) é recusado; produtos excluídos logicamente perdem
 * a categoria pelo `SET NULL` do banco.
 */
@Injectable()
export class ShopCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: ScopedRequester): Promise<ShopCategory[]> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return this.listAll(this.prisma);
  }

  async create(input: CreateShopCategoryRequest, requester: ScopedRequester): Promise<ShopCategory> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const created = await this.prisma
      .$transaction(async (tx) => {
        await lockAdvisory(tx, SHOP_CATEGORY_LOCK);
        const last = await tx.shopCategory.aggregate({ _max: { position: true } });
        return tx.shopCategory.create({
          data: { name: input.name, position: (last._max.position ?? 0) + 1 },
          include: CATEGORY_INCLUDE,
        });
      })
      .catch((error: unknown) => {
        throw this.mapWriteError(error);
      });
    return toCategory(created);
  }

  async rename(
    id: string,
    input: RenameShopCategoryRequest,
    requester: ScopedRequester,
  ): Promise<ShopCategory> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    const renamed = await this.prisma.shopCategory
      .update({ where: { id }, data: { name: input.name }, include: CATEGORY_INCLUDE })
      .catch((error: unknown) => {
        throw this.mapWriteError(error);
      });
    return toCategory(renamed);
  }

  /** Reescreve a posição (índice + 1) com a lista completa; lista incompleta, repetida ou com id sobrando é 400. */
  async reorder(
    input: ReorderShopCategoriesRequest,
    requester: ScopedRequester,
  ): Promise<ShopCategory[]> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return this.prisma.$transaction(async (tx) => {
      await lockAdvisory(tx, SHOP_CATEGORY_LOCK);
      const existing = await tx.shopCategory.findMany({ select: { id: true } });
      assertCompleteOrder(
        existing.map((category) => category.id),
        input.ids,
      );
      await Promise.all(
        input.ids.map((id, index) =>
          tx.shopCategory.update({ where: { id }, data: { position: index + 1 } }),
        ),
      );
      return this.listAll(tx);
    });
  }

  async remove(id: string, requester: ScopedRequester): Promise<void> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    await this.prisma.$transaction(async (tx) => {
      await lockAdvisory(tx, SHOP_CATEGORY_LOCK);
      const category = await tx.shopCategory.findUnique({ where: { id }, select: { id: true } });
      if (!category) throw notFound();
      const inUse = await tx.product.count({ where: { categoryId: id, excluidoEm: null } });
      if (inUse > 0) {
        throw new DomainError(
          ErrorCode.CATEGORY_IN_USE,
          "Esta categoria tem produtos. Mova ou exclua os produtos antes de excluí-la.",
          ErrorStatus.CONFLICT,
        );
      }
      await tx.shopCategory.delete({ where: { id } });
    });
  }

  private async listAll(db: Prisma.TransactionClient | PrismaService): Promise<ShopCategory[]> {
    const rows = await db.shopCategory.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: CATEGORY_INCLUDE,
    });
    return rows.map(toCategory);
  }

  /** Corrida perdida: o índice único recusou o nome; o registro sumiu entre a leitura e a escrita. */
  private mapWriteError(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new DomainError(
        ErrorCode.CATEGORY_NAME_TAKEN,
        "Já existe uma categoria com este nome.",
        ErrorStatus.CONFLICT,
      );
    }
    if ((error as { code?: unknown } | null)?.code === "P2025") return notFound();
    return error;
  }
}

function toCategory(row: CategoryRow): ShopCategory {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    productCount: row._count.products,
  };
}

function notFound(): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, "Categoria não encontrada.", ErrorStatus.NOT_FOUND);
}

function assertCompleteOrder(existingIds: string[], orderedIds: string[]): void {
  const existing = new Set(existingIds);
  const ordered = new Set(orderedIds);
  const complete =
    ordered.size === orderedIds.length &&
    orderedIds.length === existing.size &&
    orderedIds.every((id) => existing.has(id));
  if (!complete) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      "A ordem precisa trazer todas as categorias, uma única vez cada.",
      ErrorStatus.VALIDATION,
    );
  }
}
