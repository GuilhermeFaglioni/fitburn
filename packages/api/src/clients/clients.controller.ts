import {
  Body,
  Controller,
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
  clientsQuerySchema,
  createClientRequestSchema,
  Module,
  myReservationsQuerySchema,
  PermissionAction,
  updateClientRequestSchema,
  type ClientDetail,
  type ClientListItem,
  type ClientPlan,
  type ClientsQuery,
  type CreateClientRequest,
  type GamificationSummary,
  type MyReservationsQuery,
  type ReservationDetail,
  type UpdateClientRequest,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { ClientsService } from "./clients.service.js";

/** Tela de Clientes (módulo CLIENTES): a equipe enxerga os clientes do seu escopo. */
@Controller("clients")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(clientsQuerySchema)) query: ClientsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ClientListItem[]> {
    return this.clientsService.list(query, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createClientRequestSchema)) body: CreateClientRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ClientDetail> {
    return this.clientsService.create(body, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get(":id")
  detail(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClientDetail> {
    return this.clientsService.detail(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get(":id/plan")
  plan(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClientPlan> {
    return this.clientsService.plan(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get(":id/reservations")
  reservations(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(myReservationsQuerySchema)) query: MyReservationsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReservationDetail[]> {
    return this.clientsService.reservations(id, query, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get(":id/gamification")
  gamification(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<GamificationSummary> {
    return this.clientsService.gamification(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get(":id/workout-sheets")
  workoutSheets(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkoutSheet[]> {
    return this.clientsService.workoutSheets(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientRequestSchema)) body: UpdateClientRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<ClientDetail> {
    return this.clientsService.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.EDIT)
  @HttpCode(HttpStatus.OK)
  @Post(":id/deactivate")
  deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClientDetail> {
    return this.clientsService.deactivate(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.EDIT)
  @HttpCode(HttpStatus.OK)
  @Post(":id/reactivate")
  reactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClientDetail> {
    return this.clientsService.reactivate(id, requesterOf(req));
  }

  // Ponto de extensão (#43): DELETE :id — exclusão com anonimização, perm. CLIENTES/DELETE.
  // Ponto de extensão (#44): reservas em nome do cliente ficam no módulo de reservas
  // administrativas (RESERVAS), não aqui; esta tela só lista (:id/reservations).
}
