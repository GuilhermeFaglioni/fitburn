import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  assignPlanRequestSchema,
  Module,
  PermissionAction,
  planAssignmentsQuerySchema,
  type AssignPlanRequest,
  type PlanAssignment,
  type PlanAssignmentsQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { PlansService } from "./plans.service.js";

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
