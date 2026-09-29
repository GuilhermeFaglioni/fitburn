import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  assignmentsQuerySchema,
  createAssignmentRequestSchema,
  Module,
  PermissionAction,
  type Assignment,
  type AssignmentOptions,
  type AssignmentsQuery,
  type CreateAssignmentRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { AssignmentsService } from "./assignments.service.js";

@Controller("assignments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(assignmentsQuerySchema)) query: AssignmentsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment[]> {
    return this.assignmentsService.list(query, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.CREATE)
  @Get("options")
  options(@Req() req: AuthenticatedRequest): Promise<AssignmentOptions> {
    return this.assignmentsService.options(requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createAssignmentRequestSchema)) body: CreateAssignmentRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment> {
    return this.assignmentsService.create(body, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.assignmentsService.remove(id, requesterOf(req));
  }
}
