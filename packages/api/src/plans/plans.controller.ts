import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  createPlanRequestSchema,
  Module,
  PermissionAction,
  updatePlanRequestSchema,
  type CreatePlanRequest,
  type MyPlan,
  type PlanAssignmentOptions,
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
