import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import {
  dashboardQuerySchema,
  Module,
  PermissionAction,
  type Dashboard,
  type DashboardQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Dashboard da equipe; o `period` (semana ou mês atuais) vale para os indicadores de gamificação. */
  @RequirePermission(Module.DASHBOARD, PermissionAction.VIEW)
  @Get()
  get(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<Dashboard> {
    return this.dashboardService.get(req.authProfile!, req.authUser.sub, query.period);
  }
}
