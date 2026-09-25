import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ErrorCode, ErrorStatus, Module, PermissionAction, PermissionScope } from "@fitburn/contracts";
import type { CurrentUser } from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { DomainError } from "../common/errors/domain-error.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Module.USUARIOS, PermissionAction.VIEW)
  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CurrentUser> {
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

    return this.usersService.toCurrentUser(user);
  }
}
