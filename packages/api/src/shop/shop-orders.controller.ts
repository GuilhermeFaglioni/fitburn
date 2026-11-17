import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  createShopOrderRequestSchema,
  type CreateShopOrderRequest,
  type ShopOrderApprovalNotice,
  type ShopOrder,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { IdempotencyKey } from "../reservations/idempotency-key.decorator.js";
import { ShopOrdersService } from "./shop-orders.service.js";

/** Pedidos do cliente autenticado; acesso definido pelo próprio escopo do usuário. */
@Controller("shop/orders")
@UseGuards(JwtAuthGuard)
export class ShopOrdersController {
  constructor(private readonly ordersService: ShopOrdersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createShopOrderRequestSchema)) body: CreateShopOrderRequest,
    @IdempotencyKey() key: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShopOrder> {
    return this.ordersService.create(req.authUser.sub, body, key);
  }

  @Get()
  listMine(@Req() req: AuthenticatedRequest): Promise<ShopOrder[]> {
    return this.ordersService.listMine(req.authUser.sub);
  }

  @Get("approval-notice")
  approvalNotice(@Req() req: AuthenticatedRequest): Promise<ShopOrderApprovalNotice> {
    return this.ordersService.approvalNotice(req.authUser.sub);
  }

  @Get(":id")
  getMine(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ShopOrder> {
    return this.ordersService.getMine(req.authUser.sub, id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ShopOrder> {
    return this.ordersService.cancel(req.authUser.sub, id);
  }
}
