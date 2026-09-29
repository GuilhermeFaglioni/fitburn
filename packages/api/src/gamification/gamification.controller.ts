import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { Module, PermissionAction, type GamificationSummary } from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { GamificationService } from "./gamification.service.js";

@Controller("gamification")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  /** Minha gamificação (autoatendimento do cliente): o dono é sempre quem está autenticado. */
  @Get("me")
  mine(@Req() req: AuthenticatedRequest): Promise<GamificationSummary> {
    return this.gamificationService.summaryOf(req.authUser.sub);
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.VIEW)
  @Get("clients/:clientId")
  ofClient(
    @Param("clientId") clientId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<GamificationSummary> {
    return this.gamificationService.summaryForStaff(clientId, requesterOf(req));
  }
}
