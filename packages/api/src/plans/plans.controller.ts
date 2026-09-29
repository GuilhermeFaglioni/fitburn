import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  assignPlanRequestSchema,
  createPlanRequestSchema,
  Module,
  PermissionAction,
  planAssignmentsQuerySchema,
  updatePlanRequestSchema,
  type AssignPlanRequest,
  type CreatePlanRequest,
  type MyPlan,
  type PlanAssignment,
  type PlanAssignmentOptions,
  type PlanAssignmentsQuery,
  type PlanDetail,
  type UpdatePlanRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { PlansService } from "./plans.service.js";

/** Catálogo de planos (administração) e o plano do próprio cliente. */
@Controller("plans")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /** Meu plano (autoatendimento do cliente): o dono é sempre quem está autenticado. */
  @Get("mine")
  mine(@Req() req: AuthenticatedRequest): Promise<MyPlan> {
    return this.plansService.mine(req.authUser.sub);
  }

  @RequirePermission(Module.PLANOS, PermissionAction.CREATE)
  @Get("options")
  options(@Req() req: AuthenticatedRequest): Promise<PlanAssignmentOptions> {
    return this.plansService.options(requesterOf(req));
  }

  @RequirePermission(Module.PLANOS, PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthenticatedRequest): Promise<PlanDetail[]> {
    return this.plansService.list(requesterOf(req));
  }

  @RequirePermission(Module.PLANOS, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createPlanRequestSchema)) body: CreatePlanRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlanDetail> {
    return this.plansService.create(body, requesterOf(req));
  }

  @RequirePermission(Module.PLANOS, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePlanRequestSchema)) body: UpdatePlanRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlanDetail> {
    return this.plansService.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.PLANOS, PermissionAction.EDIT)
  @Post(":id/activate")
  activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PlanDetail> {
    return this.plansService.setActive(id, true, requesterOf(req));
  }

  @RequirePermission(Module.PLANOS, PermissionAction.EDIT)
  @Post(":id/deactivate")
  deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PlanDetail> {
    return this.plansService.setActive(id, false, requesterOf(req));
  }
}

/** Atribuição de planos a clientes (administração). */
@Controller("plan-assignments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlanAssignmentsController {
  constructor(private readonly plansService: PlansService) {}

  @RequirePermission(Module.PLANOS, PermissionAction.VIEW)
  @Get()
  history(
    @Query(new ZodValidationPipe(planAssignmentsQuerySchema)) query: PlanAssignmentsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlanAssignment[]> {
    return this.plansService.historyOf(query.clientId, requesterOf(req));
  }

  @RequirePermission(Module.PLANOS, PermissionAction.CREATE)
  @Post()
  assign(
    @Body(new ZodValidationPipe(assignPlanRequestSchema)) body: AssignPlanRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlanAssignment> {
    return this.plansService.assign(body, requesterOf(req));
  }
}
