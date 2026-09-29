import {
  Body,
  Controller,
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
  createGoalRequestSchema,
  goalsQuerySchema,
  Module,
  PermissionAction,
  updateGoalRequestSchema,
  type ClientSummary,
  type CreateGoalRequest,
  type GoalDetail,
  type GoalsQuery,
  type UpdateGoalRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { GoalsService } from "./goals.service.js";

/** Metas individuais: a equipe gerencia as dos clientes do seu escopo (módulo Gamificação); o cliente só lê as próprias. */
@Controller("goals")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  /** Minhas metas (autoatendimento do cliente): o dono é sempre quem está autenticado. */
  @Get("mine")
  mine(@Req() req: AuthenticatedRequest): Promise<GoalDetail[]> {
    return this.goalsService.listMine(req.authUser.sub);
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.VIEW)
  @Get("clients")
  clients(@Req() req: AuthenticatedRequest): Promise<ClientSummary[]> {
    return this.goalsService.clientsInScope(requesterOf(req));
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(goalsQuerySchema)) query: GoalsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<GoalDetail[]> {
    return this.goalsService.listForClient(query.clientId, requesterOf(req));
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createGoalRequestSchema)) body: CreateGoalRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<GoalDetail> {
    return this.goalsService.create(body, req.authUser.sub, requesterOf(req));
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateGoalRequestSchema)) body: UpdateGoalRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<GoalDetail> {
    return this.goalsService.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.EDIT)
  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  complete(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<GoalDetail> {
    return this.goalsService.complete(id, requesterOf(req));
  }

  @RequirePermission(Module.GAMIFICACAO, PermissionAction.EDIT)
  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<GoalDetail> {
    return this.goalsService.cancel(id, requesterOf(req));
  }
}
