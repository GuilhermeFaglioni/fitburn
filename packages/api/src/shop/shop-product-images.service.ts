import { Injectable } from "@nestjs/common";
import type { ProductImage, Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_SIZE_BYTES,
  Module,
  PermissionAction,
  PermissionScope,
  type ProductImageMimeType,
  type ProductImageUploadMetadata,
  type ReorderShopProductImagesRequest,
  type ShopProductImage,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PermissionsService } from "../permissions/permissions.service.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SHOP_FULL_SCOPE_MESSAGE } from "./shop-constants.js";

export interface ProductImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

type ProductImageMetadataRow = Pick<
  ProductImage,
  "id" | "mimeType" | "sizeBytes" | "position" | "isCover"
>;

@Injectable()
export class ShopProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async upload(
    productId: string,
    metadata: ProductImageUploadMetadata,
    file: ProductImageFile | undefined,
    requester: ScopedRequester,
  ): Promise<ShopProductImage> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    if (!file) throw validationError("Envie um arquivo de imagem.");
    if (file.size > MAX_PRODUCT_IMAGE_SIZE_BYTES) {
      throw new DomainError(ErrorCode.PAYLOAD_TOO_LARGE, "A foto pode ter no máximo 1,5 MB.", 413);
    }
    if (file.size !== metadata.sizeBytes)
      throw validationError("O tamanho informado não corresponde ao arquivo.");
    if (file.mimetype !== metadata.mimeType) {
      throw new DomainError(
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        "O tipo informado não corresponde ao arquivo.",
        415,
      );
    }
    if (file.size !== file.buffer.byteLength)
      throw validationError("O tamanho do arquivo é inválido.");

    const image = await this.prisma.$transaction(async (tx) => {
      await lockProduct(tx, productId);
      const product = await tx.product.findFirst({
        where: { id: productId, excluidoEm: null },
        select: { id: true },
      });
      if (!product) throw imageNotFound();

      const current = await tx.productImage.count({ where: { productId } });
      if (current >= MAX_PRODUCT_IMAGES) {
        throw new DomainError(
          ErrorCode.CONFLICT,
          "O produto pode ter no máximo 5 fotos.",
          ErrorStatus.CONFLICT,
        );
      }
      return tx.productImage.create({
        data: {
          productId,
          mimeType: metadata.mimeType,
          sizeBytes: file.size,
          content: Uint8Array.from(file.buffer),
          position: current,
          isCover: current === 0,
        },
      });
    });
    return toImageMetadata(image);
  }

  async reorder(
    productId: string,
    input: ReorderShopProductImagesRequest,
    requester: ScopedRequester,
  ): Promise<ShopProductImage[]> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return this.prisma.$transaction(async (tx) => {
      await lockProduct(tx, productId);
      await assertProductExists(tx, productId);
      const rows = await tx.productImage.findMany({
        where: { productId },
        orderBy: { position: "asc" },
      });
      if (!sameIds(rows, input.imageIds))
        throw validationError("Informe todas as fotos do produto na nova ordem.");

      await shiftToTemporaryPositions(tx, rows);
      for (const [position, id] of input.imageIds.entries()) {
        await tx.productImage.update({ where: { id }, data: { position } });
      }
      return (
        await tx.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } })
      ).map(toImageMetadata);
    });
  }

  async setCover(
    productId: string,
    imageId: string,
    requester: ScopedRequester,
  ): Promise<ShopProductImage[]> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    return this.prisma.$transaction(async (tx) => {
      await lockProduct(tx, productId);
      await assertProductExists(tx, productId);
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId },
        select: { id: true },
      });
      if (!image) throw imageNotFound();
      await tx.productImage.updateMany({
        where: { productId, isCover: true },
        data: { isCover: false },
      });
      await tx.productImage.update({ where: { id: imageId }, data: { isCover: true } });
      return (
        await tx.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } })
      ).map(toImageMetadata);
    });
  }

  async remove(productId: string, imageId: string, requester: ScopedRequester): Promise<void> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);
    await this.prisma.$transaction(async (tx) => {
      await lockProduct(tx, productId);
      await assertProductExists(tx, productId);
      const rows = await tx.productImage.findMany({
        where: { productId },
        orderBy: { position: "asc" },
      });
      const removed = rows.find((image) => image.id === imageId);
      if (!removed) throw imageNotFound();

      await tx.productImage.delete({ where: { id: imageId } });
      const remaining = rows.filter((image) => image.id !== imageId);
      await shiftToTemporaryPositions(tx, remaining);
      for (const [position, image] of remaining.entries()) {
        await tx.productImage.update({
          where: { id: image.id },
          data: {
            position,
            isCover: removed.isCover ? position === 0 : image.isCover,
          },
        });
      }
    });
  }

  async read(
    imageId: string,
    requesterId: string,
  ): Promise<{ content: Buffer; mimeType: ProductImageMimeType; sizeBytes: number }> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, product: { excluidoEm: null } },
      include: { product: { select: { visivel: true } } },
    });
    if (!image) throw imageNotFound();
    if (!image.product.visivel) await this.assertCanReadHiddenProduct(requesterId);
    return {
      content: Buffer.from(image.content),
      mimeType: image.mimeType as ProductImageMimeType,
      sizeBytes: image.sizeBytes,
    };
  }

  private async assertCanReadHiddenProduct(requesterId: string): Promise<void> {
    const context = await this.permissions.getUserAuthorizationContext(requesterId);
    const canView =
      context !== null &&
      (await this.permissions.hasPermission(context.profile, Module.LOJA, PermissionAction.VIEW)) &&
      (await this.permissions.getEffectiveScope(context.profile, Module.LOJA)) ===
        PermissionScope.ALL;
    if (!canView) throw imageNotFound();
  }
}

async function lockProduct(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
}

async function assertProductExists(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const product = await tx.product.findFirst({
    where: { id: productId, excluidoEm: null },
    select: { id: true },
  });
  if (!product) throw imageNotFound();
}

async function shiftToTemporaryPositions(
  tx: Prisma.TransactionClient,
  images: ProductImage[],
): Promise<void> {
  const offset = images.length + MAX_PRODUCT_IMAGES + 1;
  for (const image of images) {
    await tx.productImage.update({
      where: { id: image.id },
      data: { position: image.position + offset },
    });
  }
}

function sameIds(images: ProductImage[], requestedIds: string[]): boolean {
  return (
    images.length === requestedIds.length &&
    images.every((image) => requestedIds.includes(image.id))
  );
}

function toImageMetadata(image: ProductImageMetadataRow): ShopProductImage {
  return {
    id: image.id,
    mimeType: image.mimeType as ProductImageMimeType,
    sizeBytes: image.sizeBytes,
    position: image.position,
    isCover: image.isCover,
    url: `/api/shop/product-images/${image.id}`,
  };
}

function validationError(message: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, message, ErrorStatus.VALIDATION);
}

function imageNotFound(): DomainError {
  return new DomainError(
    ErrorCode.NOT_FOUND,
    "Foto do produto não encontrada.",
    ErrorStatus.NOT_FOUND,
  );
}
