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
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createShopCategoryRequestSchema,
  Module,
  PermissionAction,
  renameShopCategoryRequestSchema,
  reorderShopCategoriesRequestSchema,
  type CreateShopCategoryRequest,
  type RenameShopCategoryRequest,
  type ReorderShopCategoriesRequest,
  type ShopCategory,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { ShopCategoriesService } from "./shop-categories.service.js";

/** Categorias da loja (administração). Todas as rotas exigem escopo total. */
@Controller("shop/admin/categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopCategoriesController {
  constructor(private readonly categoriesService: ShopCategoriesService) {}

  @RequirePermission(Module.LOJA, PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthenticatedRequest): Promise<ShopCategory[]> {
    return this.categoriesService.list(requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createShopCategoryRequestSchema)) body: CreateShopCategoryRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopCategory> {
    return this.categoriesService.create(body, requesterOf(req));
  }

  /** Declarada antes de `PATCH :id` para deixar explícito que `order` não é um id. */
  @RequirePermission(Module.LOJA, PermissionAction.EDIT)
  @Put("order")
  reorder(
    @Body(new ZodValidationPipe(reorderShopCategoriesRequestSchema)) body: ReorderShopCategoriesRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopCategory[]> {
    return this.categoriesService.reorder(body, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EDIT)
  @Patch(":id")
  rename(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(renameShopCategoryRequestSchema)) body: RenameShopCategoryRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopCategory> {
    return this.categoriesService.rename(id, body, requesterOf(req));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Module.LOJA, PermissionAction.DELETE)
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.categoriesService.remove(id, requesterOf(req));
  }
}
