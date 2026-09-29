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
  createOccurrenceRequestSchema,
  createRecurringOccurrencesRequestSchema,
  dateRangeQuerySchema,
  Module,
  PermissionAction,
  type CreateOccurrenceRequest,
  type CreateRecurringOccurrencesRequest,
  type DateRangeQuery,
  type OccurrenceDetail,
  type OccurrenceFormOptions,
  type RecurringOccurrencesResult,
  type UpdateOccurrenceRequest,
  updateOccurrenceRequestSchema,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { OccurrencesService } from "./occurrences.service.js";

@Controller("occurrences")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OccurrencesController {
  constructor(private readonly occurrencesService: OccurrencesService) {}

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(dateRangeQuerySchema)) query: DateRangeQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<OccurrenceDetail[]> {
    return this.occurrencesService.list(query.from, query.to, requesterOf(req));
  }

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.VIEW)
  @Get("options")
  options(): Promise<OccurrenceFormOptions> {
    return this.occurrencesService.formOptions();
  }

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createOccurrenceRequestSchema)) body: CreateOccurrenceRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<OccurrenceDetail> {
    return this.occurrencesService.create(body, requesterOf(req));
  }

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.CREATE)
  @Post("recurring")
  createRecurring(
    @Body(new ZodValidationPipe(createRecurringOccurrencesRequestSchema))
    body: CreateRecurringOccurrencesRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<RecurringOccurrencesResult> {
    return this.occurrencesService.createRecurring(body, requesterOf(req));
  }

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOccurrenceRequestSchema)) body: UpdateOccurrenceRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<OccurrenceDetail> {
    return this.occurrencesService.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.EDIT)
  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<OccurrenceDetail> {
    return this.occurrencesService.cancel(id, requesterOf(req));
  }

  @RequirePermission(Module.OCORRENCIAS, PermissionAction.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.occurrencesService.delete(id, requesterOf(req));
  }
}
