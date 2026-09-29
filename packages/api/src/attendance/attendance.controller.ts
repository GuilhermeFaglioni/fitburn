import {
  Body,
  Controller,
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
  dateRangeQuerySchema,
  markAttendanceRequestSchema,
  Module,
  PermissionAction,
  type AttendanceClass,
  type AttendanceEntry,
  type AttendanceRoster,
  type DateRangeQuery,
  type MarkAttendanceRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { AttendanceService } from "./attendance.service.js";

@Controller("attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @RequirePermission(Module.PRESENCA, PermissionAction.VIEW)
  @Get("classes")
  listClasses(
    @Query(new ZodValidationPipe(dateRangeQuerySchema)) query: DateRangeQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttendanceClass[]> {
    return this.attendanceService.listClasses(query.from, query.to, requesterOf(req));
  }

  @RequirePermission(Module.PRESENCA, PermissionAction.VIEW)
  @Get("classes/:occurrenceId")
  roster(
    @Param("occurrenceId") occurrenceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttendanceRoster> {
    return this.attendanceService.roster(occurrenceId, requesterOf(req));
  }

  @RequirePermission(Module.PRESENCA, PermissionAction.EXECUTE)
  @Post("reservations/:reservationId")
  @HttpCode(HttpStatus.OK)
  mark(
    @Param("reservationId") reservationId: string,
    @Body(new ZodValidationPipe(markAttendanceRequestSchema)) body: MarkAttendanceRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttendanceEntry> {
    return this.attendanceService.mark(reservationId, body.status, requesterOf(req));
  }
}
