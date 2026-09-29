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
  adminReservationsQuerySchema,
  createAdminReservationRequestSchema,
  Module,
  PermissionAction,
  reservationClientsQuerySchema,
  rescheduleReservationRequestSchema,
  reservationPreviewQuerySchema,
  type AdminReservationDetail,
  type AdminReservationsQuery,
  type CreateAdminReservationRequest,
  type RescheduleReservationRequest,
  type ReservationClientOption,
  type ReservationClientsQuery,
  type ReservationPreview,
  type ReservationPreviewQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { AdminReservationsService } from "./admin-reservations.service.js";
import { IdempotencyKey } from "./idempotency-key.decorator.js";

/**
 * Reservas feitas, consultadas e alteradas pela equipe em nome dos clientes
 * (módulo RESERVAS). O autoatendimento do cliente fica em /reservations.
 * Criar exige "criar"; cancelar e remarcar exigem "editar".
 */
@Controller("admin/reservations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminReservationsController {
  constructor(private readonly adminReservationsService: AdminReservationsService) {}

  @RequirePermission(Module.RESERVAS, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(adminReservationsQuerySchema)) query: AdminReservationsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminReservationDetail[]> {
    return this.adminReservationsService.list(query, requesterOf(req));
  }

  /** Clientes ativos para o seletor de quem reservar: só precisa de Reservas, não de Clientes. */
  @RequirePermission(Module.RESERVAS, PermissionAction.VIEW)
  @Get("clients")
  clients(
    @Query(new ZodValidationPipe(reservationClientsQuerySchema)) query: ReservationClientsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReservationClientOption[]> {
    return this.adminReservationsService.searchClients(query, requesterOf(req));
  }

  @RequirePermission(Module.RESERVAS, PermissionAction.VIEW)
  @Get("preview")
  preview(
    @Query(new ZodValidationPipe(reservationPreviewQuerySchema)) query: ReservationPreviewQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReservationPreview> {
    return this.adminReservationsService.preview(query, requesterOf(req));
  }

  @RequirePermission(Module.RESERVAS, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createAdminReservationRequestSchema))
    body: CreateAdminReservationRequest,
    @IdempotencyKey() idempotencyKey: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminReservationDetail> {
    return this.adminReservationsService.create(body, idempotencyKey, requesterOf(req));
  }

  @RequirePermission(Module.RESERVAS, PermissionAction.EDIT)
  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminReservationDetail> {
    return this.adminReservationsService.cancel(id, requesterOf(req));
  }

  @RequirePermission(Module.RESERVAS, PermissionAction.EDIT)
  @Post(":id/reschedule")
  reschedule(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rescheduleReservationRequestSchema))
    body: RescheduleReservationRequest,
    @IdempotencyKey() idempotencyKey: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminReservationDetail> {
    return this.adminReservationsService.reschedule(id, body, idempotencyKey, requesterOf(req));
  }
}
