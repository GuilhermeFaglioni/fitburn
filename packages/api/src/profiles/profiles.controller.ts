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
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  ALL_MODULES,
  createProfileRequestSchema,
  ErrorCode,
  ErrorStatus,
  MODULE_CATALOG,
  Module,
  PermissionAction,
  setModuleAccessRequestSchema,
  updateProfileRequestSchema,
  type CreateProfileRequest,
  type ModuleCatalog,
  type ModuleName,
  type ProfileDetail,
  type SetModuleAccessRequest,
  type UpdateProfileRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { DomainError } from "../common/errors/domain-error.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { ProfilesService } from "./profiles.service.js";

@Controller("profiles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.VIEW)
  @Get("catalog")
  catalog(): ModuleCatalog {
    return MODULE_CATALOG;
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.VIEW)
  @Get()
  async list(): Promise<ProfileDetail[]> {
    const profiles = await this.profilesService.list();
    return Promise.all(profiles.map((profile) => this.profilesService.toProfileDetail(profile)));
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.VIEW)
  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ProfileDetail> {
    const profile = await this.profilesService.findByIdOrThrow(id);
    return this.profilesService.toProfileDetail(profile);
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.CREATE)
  @Post()
  async create(
    @Body(new ZodValidationPipe(createProfileRequestSchema)) body: CreateProfileRequest,
  ): Promise<ProfileDetail> {
    const profile = await this.profilesService.create(body);
    return this.profilesService.toProfileDetail(profile);
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT)
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<ProfileDetail> {
    const profile = await this.profilesService.update(id, body);
    return this.profilesService.toProfileDetail(profile);
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT)
  @Post(":id/activate")
  async activate(@Param("id") id: string): Promise<ProfileDetail> {
    const profile = await this.profilesService.activate(id);
    return this.profilesService.toProfileDetail(profile);
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT)
  @Post(":id/deactivate")
  async deactivate(@Param("id") id: string): Promise<ProfileDetail> {
    const profile = await this.profilesService.deactivate(id);
    return this.profilesService.toProfileDetail(profile);
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT)
  @Put(":id/module-access/:module")
  async setModuleAccess(
    @Param("id") id: string,
    @Param("module") moduleParam: string,
    @Body(new ZodValidationPipe(setModuleAccessRequestSchema)) body: SetModuleAccessRequest,
  ): Promise<ProfileDetail> {
    if (!ALL_MODULES.includes(moduleParam as ModuleName)) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "Módulo inválido.", ErrorStatus.VALIDATION);
    }
    const module = moduleParam as ModuleName;

    await this.profilesService.setModuleAccess(id, module, body.actions, body.scope);
    const profile = await this.profilesService.findByIdOrThrow(id);
    return this.profilesService.toProfileDetail(profile);
  }

  @RequirePermission(Module.PERFIS_DE_ACESSO, PermissionAction.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  async remove(@Param("id") id: string): Promise<void> {
    await this.profilesService.delete(id);
  }
}
