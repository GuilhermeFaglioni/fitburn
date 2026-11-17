import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  listAdminShopOrdersQuerySchema,
  Module,
  PermissionAction,
  rejectShopOrderRequestSchema,
  type AdminShopOrder,
  type ListAdminShopOrdersQuery,
  type PendingShopOrdersCount,
  type RejectShopOrderRequest,
  type ShopOrder,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { ShopOrdersService } from "./shop-orders.service.js";

/** Fila administrativa de pedidos, protegida pelas permissões específicas da Loja. */
@Controller("shop/admin/orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopAdminOrdersController {
  constructor(private readonly ordersService: ShopOrdersService) {}

  @RequirePermission(Module.LOJA, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(listAdminShopOrdersQuerySchema)) query: ListAdminShopOrdersQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminShopOrder[]> {
    return this.ordersService.listAdmin(query, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.VIEW)
  @Get("pending-count")
  pendingCount(@Req() req: AuthenticatedRequest): Promise<PendingShopOrdersCount> {
    return this.ordersService.pendingCount(requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EXECUTE)
  @Post(":id/approve")
  approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ShopOrder> {
    return this.ordersService.approve(id, req.authUser.sub, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EXECUTE)
  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectShopOrderRequestSchema)) body: RejectShopOrderRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopOrder> {
    return this.ordersService.reject(id, req.authUser.sub, body.reason, requesterOf(req));
  }

  @RequirePermission(Module.LOJA, PermissionAction.EXECUTE)
  @Post(":id/deliver")
  deliver(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ShopOrder> {
    return this.ordersService.deliver(id, req.authUser.sub, requesterOf(req));
  }
}
