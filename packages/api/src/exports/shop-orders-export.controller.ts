import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import {
  dateRangeQuerySchema,
  Module,
  PermissionAction,
  type DateRangeQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { sendCsv } from "./csv-response.js";
import { resolveExportPeriod } from "./export-period.js";
import { ShopOrdersExportService } from "./shop-orders-export.service.js";

@Controller("exports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopOrdersExportController {
  constructor(private readonly shopOrdersExport: ShopOrdersExportService) {}

  /** Pedidos por data local de criação, com a mesma permissão da fila administrativa da Loja. */
  @RequirePermission(Module.LOJA, PermissionAction.VIEW)
  @Get("shop-orders")
  async shopOrders(
    @Query(new ZodValidationPipe(dateRangeQuerySchema)) query: DateRangeQuery,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const period = resolveExportPeriod(query.from, query.to);
    const csv = await this.shopOrdersExport.buildCsv(period, requesterOf(req));
    sendCsv(res, `pedidos_${period.from}_${period.to}.csv`, csv);
  }
}
