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
  createWorkoutSheetRequestSchema,
  Module,
  PermissionAction,
  updateWorkoutSheetRequestSchema,
  workoutSheetsQuerySchema,
  type ClientSummary,
  type CreateWorkoutSheetRequest,
  type UpdateWorkoutSheetRequest,
  type WorkoutSheet,
  type WorkoutSheetsQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { requesterOf } from "../permissions/scoped-requester.js";
import { WorkoutSheetsService } from "./workout-sheets.service.js";

/** Fichas de treino: a equipe gerencia as dos clientes do seu escopo; o cliente só lê as próprias. */
@Controller("workout-sheets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkoutSheetsController {
  constructor(private readonly workoutSheetsService: WorkoutSheetsService) {}

  /** Minhas fichas (autoatendimento do cliente): o dono é sempre quem está autenticado. */
  @Get("mine")
  mine(@Req() req: AuthenticatedRequest): Promise<WorkoutSheet[]> {
    return this.workoutSheetsService.listMine(req.authUser.sub);
  }

  @Get("mine/:id")
  mineOne(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<WorkoutSheet> {
    return this.workoutSheetsService.findMine(id, req.authUser.sub);
  }

  @RequirePermission(Module.FICHAS_DE_TREINO, PermissionAction.VIEW)
  @Get("clients")
  clients(@Req() req: AuthenticatedRequest): Promise<ClientSummary[]> {
    return this.workoutSheetsService.clientsInScope(requesterOf(req));
  }

  @RequirePermission(Module.FICHAS_DE_TREINO, PermissionAction.VIEW)
  @Get()
  list(
    @Query(new ZodValidationPipe(workoutSheetsQuerySchema)) query: WorkoutSheetsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkoutSheet[]> {
    return this.workoutSheetsService.listForClient(query.clientId, requesterOf(req));
  }

  @RequirePermission(Module.FICHAS_DE_TREINO, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createWorkoutSheetRequestSchema)) body: CreateWorkoutSheetRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkoutSheet> {
    return this.workoutSheetsService.create(body, req.authUser.sub, requesterOf(req));
  }

  @RequirePermission(Module.FICHAS_DE_TREINO, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkoutSheetRequestSchema)) body: UpdateWorkoutSheetRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkoutSheet> {
    return this.workoutSheetsService.update(id, body, requesterOf(req));
  }

  @RequirePermission(Module.FICHAS_DE_TREINO, PermissionAction.DELETE)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.workoutSheetsService.remove(id, requesterOf(req));
  }
}
