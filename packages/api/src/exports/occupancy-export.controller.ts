import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import {
  dateRangeQuerySchema,
  Module,
  PermissionAction,
  type DateRangeQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { sendCsv } from "./csv-response.js";
import { resolveExportPeriod } from "./export-period.js";
import { OccupancyExportService } from "./occupancy-export.service.js";

@Controller("exports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OccupancyExportController {
  constructor(private readonly occupancyExport: OccupancyExportService) {}

  /** Ocupação por ocorrência, por data inicial local (inclusive). Mesmas permissões da agenda. */
  @RequirePermission(Module.OCORRENCIAS, PermissionAction.VIEW)
  @Get("occupancy")
  async occupancy(
    @Query(new ZodValidationPipe(dateRangeQuerySchema)) query: DateRangeQuery,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const period = resolveExportPeriod(query.from, query.to);
    const csv = await this.occupancyExport.buildCsv(period, requesterOf(req));
    sendCsv(res, `ocupacao_${period.from}_${period.to}.csv`, csv);
  }
}
