import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  createOccurrenceRequestSchema,
  dateRangeQuerySchema,
  Module,
  PermissionAction,
  type CreateOccurrenceRequest,
  type DateRangeQuery,
  type OccurrenceDetail,
  type OccurrenceFormOptions,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { OccurrencesService, type OccurrenceRequester } from "./occurrences.service.js";

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
}

function requesterOf(req: AuthenticatedRequest): OccurrenceRequester {
  return { userId: req.authUser.sub, scope: req.authScope! };
}
