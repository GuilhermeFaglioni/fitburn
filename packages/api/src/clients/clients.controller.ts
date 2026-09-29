import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  clientsQuerySchema,
  createClientRequestSchema,
  Module,
  PermissionAction,
  updateClientRequestSchema,
  type ClientListItem,
  type ClientOverview,
  type ClientsQuery,
  type CreateClientRequest,
  type UpdateClientRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { ClientsService } from "./clients.service.js";

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

  @RequirePermission(Module.CLIENTES, PermissionAction.VIEW)
  @Get(":id")
  overview(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClientOverview> {
    return this.clientsService.overview(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createClientRequestSchema)) body: CreateClientRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserDetail> {
    return this.clientsService.create(body, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientRequestSchema)) body: UpdateClientRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserDetail> {
    return this.clientsService.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.EDIT)
  @Post(":id/deactivate")
  deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<UserDetail> {
    return this.clientsService.deactivate(id, requesterOf(req));
  }

  @RequirePermission(Module.CLIENTES, PermissionAction.EDIT)
  @Post(":id/reactivate")
  reactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<UserDetail> {
    return this.clientsService.reactivate(id, requesterOf(req));
  }
}
