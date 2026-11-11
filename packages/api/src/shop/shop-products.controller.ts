import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createShopProductRequestSchema,
  listShopProductsQuerySchema,
  Module,
  PermissionAction,
  updateShopProductRequestSchema,
  type CreateShopProductRequest,
  type ListShopProductsQuery,
  type ShopProduct,
  type UpdateShopProductRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { ShopProductsService } from "./shop-products.service.js";

/** Produtos da loja (administração). Todas as rotas exigem escopo total. */
@Controller("shop/admin/products")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopProductsController {
  constructor(private readonly productsService: ShopProductsService) {}

  @RequirePermission(Module.LOJA, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(listShopProductsQuerySchema)) query: ListShopProductsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopProduct[]> {
    return this.productsService.list(query, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.VIEW)
  @Get(":id")
  get(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ShopProduct> {
    return this.productsService.get(id, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createShopProductRequestSchema)) body: CreateShopProductRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopProduct> {
    return this.productsService.create(body, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateShopProductRequestSchema)) body: UpdateShopProductRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopProduct> {
    return this.productsService.update(id, body, requesterOf(req));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Module.LOJA, PermissionAction.DELETE)
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.productsService.remove(id, requesterOf(req));
  }
}
