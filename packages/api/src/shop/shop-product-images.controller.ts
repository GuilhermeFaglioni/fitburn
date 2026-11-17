import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  MAX_PRODUCT_IMAGE_SIZE_BYTES,
  Module,
  PermissionAction,
  productImageUploadMetadataSchema,
  removeShopProductImageRequestSchema,
  reorderShopProductImagesRequestSchema,
  setShopProductCoverRequestSchema,
  type ProductImageUploadMetadata,
  type ReorderShopProductImagesRequest,
  type SetShopProductCoverRequest,
  type ShopProductImage,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { ShopProductImagesService } from "./shop-product-images.service.js";
import type { ProductImageFile } from "./shop-product-images.service.js";

/** Upload, ordem, capa e remoção de fotos no contexto do produto, todos com escopo ALL. */
@Controller("shop/admin/products/:productId/images")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopProductImagesController {
  constructor(private readonly imagesService: ShopProductImagesService) {}

  @RequirePermission(Module.LOJA, PermissionAction.CREATE)
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE_BYTES } }))
  upload(
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(productImageUploadMetadataSchema))
    metadata: ProductImageUploadMetadata,
    @UploadedFile() file: ProductImageFile | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopProductImage> {
    return this.imagesService.upload(productId, metadata, file, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EDIT)
  @Put("order")
  reorder(
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(reorderShopProductImagesRequestSchema))
    body: ReorderShopProductImagesRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopProductImage[]> {
    return this.imagesService.reorder(productId, body, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EDIT)
  @Put("cover")
  setCover(
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(setShopProductCoverRequestSchema)) body: SetShopProductCoverRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopProductImage[]> {
    return this.imagesService.setCover(productId, body.imageId, requesterOf(req));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Module.LOJA, PermissionAction.DELETE)
  @Delete(":imageId")
  remove(
    @Param("productId") productId: string,
    @Param(new ZodValidationPipe(removeShopProductImageRequestSchema)) body: { imageId: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.imagesService.remove(productId, body.imageId, requesterOf(req));
  }
}

/** Leitura autenticada; cliente vê apenas produto visível, equipe também pode ver seus ocultos. */
@Controller("shop/product-images")
@UseGuards(JwtAuthGuard)
export class ShopProductImageContentController {
  constructor(private readonly imagesService: ShopProductImagesService) {}

  @Get(":id")
  @Header("Cache-Control", "private, max-age=31536000, immutable")
  async get(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<StreamableFile> {
    const image = await this.imagesService.read(id, req.authUser.sub);
    return new StreamableFile(image.content, { type: image.mimeType, length: image.sizeBytes });
  }
}
