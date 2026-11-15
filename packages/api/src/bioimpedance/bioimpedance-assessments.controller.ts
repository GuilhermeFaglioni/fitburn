import {
  Body,
  Controller,
  Delete,
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
  assessmentsQuerySchema,
  createAssessmentRequestSchema,
  Module,
  PermissionAction,
  updateAssessmentRequestSchema,
  type AssessmentClient,
  type AssessmentsList,
  type AssessmentsQuery,
  type BioimpedanceAssessment,
  type CreateAssessmentRequest,
  type UpdateAssessmentRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { BioimpedanceAssessmentsService } from "./bioimpedance-assessments.service.js";

/**
 * Avaliações de bioimpedância: a equipe age pelo módulo BIOIMPEDANCIA (escopo e consentimento
 * valem em todas as rotas); o cliente usa as rotas "mine", fora da matriz de permissões.
 */
@Controller("bioimpedance/assessments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BioimpedanceAssessmentsController {
  constructor(private readonly assessments: BioimpedanceAssessmentsService) {}

  @Get("mine")
  mine(@Req() req: AuthenticatedRequest): Promise<BioimpedanceAssessment[]> {
    return this.assessments.listMine(req.authUser.sub);
  }

  @Get("mine/:id")
  mineOne(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BioimpedanceAssessment> {
    return this.assessments.findMine(id, req.authUser.sub);
  }

  @Delete("mine/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMine(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.assessments.removeMine(id, req.authUser.sub);
  }

  @RequirePermission(Module.BIOIMPEDANCIA, PermissionAction.VIEW)
  @Get("clients")
  clients(@Req() req: AuthenticatedRequest): Promise<AssessmentClient[]> {
    return this.assessments.clientsInScope(requesterOf(req));
  }

  @RequirePermission(Module.BIOIMPEDANCIA, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(assessmentsQuerySchema)) query: AssessmentsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssessmentsList> {
    return this.assessments.list(query, requesterOf(req));
  }

  @RequirePermission(Module.BIOIMPEDANCIA, PermissionAction.VIEW)
  @Get(":id")
  one(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BioimpedanceAssessment> {
    return this.assessments.findOne(id, requesterOf(req));
  }

  @RequirePermission(Module.BIOIMPEDANCIA, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createAssessmentRequestSchema)) body: CreateAssessmentRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<BioimpedanceAssessment> {
    return this.assessments.create(body, req.authUser.sub, requesterOf(req));
  }

  @RequirePermission(Module.BIOIMPEDANCIA, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAssessmentRequestSchema)) body: UpdateAssessmentRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<BioimpedanceAssessment> {
    return this.assessments.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.BIOIMPEDANCIA, PermissionAction.DELETE)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.assessments.remove(id, req.authUser.sub, requesterOf(req));
  }
}
