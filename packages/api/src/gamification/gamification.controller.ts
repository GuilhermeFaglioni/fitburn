import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import {
  Module,
  PermissionAction,
  rankingConsentRequestSchema,
  rankingQuerySchema,
  type RankingConsentRequest,
  type RankingConsentResponse,
  type GamificationSummary,
  type Ranking,
  type RankingQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
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

  /** Ranking do período atual: os participantes só aparecem pelo primeiro nome e a inicial. */
  @Get("ranking")
  ranking(
    @Query(new ZodValidationPipe(rankingQuerySchema)) query: RankingQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<Ranking> {
    return this.gamificationService.ranking(query.period, req.authUser.sub);
  }

  @Get("ranking/consent")
  rankingConsent(@Req() req: AuthenticatedRequest): Promise<RankingConsentResponse> {
    return this.gamificationService.rankingConsent(req.authUser.sub);
  }

  @Patch("ranking/consent")
  updateRankingConsent(
    @Body(new ZodValidationPipe(rankingConsentRequestSchema)) body: RankingConsentRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<RankingConsentResponse> {
    return this.gamificationService.setRankingConsent(req.authUser.sub, body.consented);
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
