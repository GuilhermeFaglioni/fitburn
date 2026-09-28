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
  UseGuards,
} from "@nestjs/common";
import {
  createModalityRequestSchema,
  Module,
  PermissionAction,
  updateModalityRequestSchema,
  type CreateModalityRequest,
  type ModalityDetail,
  type UpdateModalityRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { ModalitiesService } from "./modalities.service.js";

@Controller("modalities")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModalitiesController {
  constructor(private readonly modalitiesService: ModalitiesService) {}

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.VIEW)
  @Get()
  list(): Promise<ModalityDetail[]> {
    return this.modalitiesService.list();
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createModalityRequestSchema)) body: CreateModalityRequest,
  ): Promise<ModalityDetail> {
    return this.modalitiesService.create(body);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateModalityRequestSchema)) body: UpdateModalityRequest,
  ): Promise<ModalityDetail> {
    return this.modalitiesService.update(id, body);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT)
  @Post(":id/activate")
  activate(@Param("id") id: string): Promise<ModalityDetail> {
    return this.modalitiesService.activate(id);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT)
  @Post(":id/deactivate")
  deactivate(@Param("id") id: string): Promise<ModalityDetail> {
    return this.modalitiesService.deactivate(id);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  async remove(@Param("id") id: string): Promise<void> {
    await this.modalitiesService.delete(id);
  }
}
