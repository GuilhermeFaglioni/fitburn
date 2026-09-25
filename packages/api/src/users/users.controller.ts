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
  createClientRequestSchema,
  createStaffRequestSchema,
  ErrorCode,
  ErrorStatus,
  Module,
  PermissionAction,
  PermissionScope,
  resetPasswordRequestSchema,
  updateUserRequestSchema,
  type CreateClientRequest,
  type CreateStaffRequest,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  type UserDetail,
} from "@fitburn/contracts";
import type { UserStatus } from "@prisma/client";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { DomainError } from "../common/errors/domain-error.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermission(Module.USUARIOS, PermissionAction.VIEW)
  @Get()
  async list(
    @Query("profileId") profileId: string | undefined,
    @Query("status") status: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserDetail[]> {
    if (status !== undefined && status !== "ACTIVE" && status !== "INACTIVE") {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "Status inválido.", ErrorStatus.VALIDATION);
    }

    const users = await this.usersService.list(
      { profileId, status: status as UserStatus | undefined },
      req.authScope!,
      req.authUser.sub,
    );
    return users.map((user) => this.usersService.toUserDetail(user));
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.VIEW)
  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<UserDetail> {
    if (req.authScope === PermissionScope.OWN && id !== req.authUser.sub) {
      throw new DomainError(
        ErrorCode.OUT_OF_SCOPE,
        "Você só pode acessar os próprios dados.",
        ErrorStatus.FORBIDDEN,
      );
    }

    const user = await this.usersService.findById(id);
    if (!user) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Usuário não encontrado.", ErrorStatus.NOT_FOUND);
    }
    return this.usersService.toUserDetail(user);
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.CREATE)
  @Post("clients")
  async createClient(
    @Body(new ZodValidationPipe(createClientRequestSchema)) body: CreateClientRequest,
  ): Promise<UserDetail> {
    const user = await this.usersService.createClient(body);
    return this.usersService.toUserDetail(user);
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.CREATE)
  @Post("staff")
  async createStaff(
    @Body(new ZodValidationPipe(createStaffRequestSchema)) body: CreateStaffRequest,
  ): Promise<UserDetail> {
    const user = await this.usersService.createStaff(body);
    return this.usersService.toUserDetail(user);
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.EDIT)
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUserRequestSchema)) body: UpdateUserRequest,
  ): Promise<UserDetail> {
    const user = await this.usersService.update(id, body);
    return this.usersService.toUserDetail(user);
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.EDIT)
  @Post(":id/deactivate")
  async deactivate(@Param("id") id: string): Promise<UserDetail> {
    const user = await this.usersService.deactivate(id);
    return this.usersService.toUserDetail(user);
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.EDIT)
  @Post(":id/reactivate")
  async reactivate(@Param("id") id: string): Promise<UserDetail> {
    const user = await this.usersService.reactivate(id);
    return this.usersService.toUserDetail(user);
  }

  @RequirePermission(Module.USUARIOS, PermissionAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(":id/reset-password")
  async resetPassword(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
  ): Promise<void> {
    await this.usersService.resetPassword(id, body.newPassword);
  }
}
