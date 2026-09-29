import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ErrorCode, ErrorStatus } from "@fitburn/contracts";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { DomainError } from "../common/errors/domain-error.js";
import { PERMISSION_METADATA_KEY, type RequiredPermission } from "./require-permission.decorator.js";
import { PermissionsService } from "./permissions.service.js";

/**
 * Roda depois do JwtAuthGuard (precisa de request.authUser já preenchido).
 * Uma rota sem @RequirePermission passa direto — o guard não decide sozinho
 * o que precisa de permissão, cada controller declara explicitamente.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const profile = await this.permissionsService.getProfileForUser(request.authUser.sub);
    if (!profile) {
      throw new DomainError(
        ErrorCode.UNAUTHENTICATED,
        "Sessão inválida ou expirada.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }

    const allowed = await this.permissionsService.hasPermission(
      profile,
      required.module,
      required.action,
    );
    if (!allowed) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        "Você não tem permissão para executar esta ação.",
        ErrorStatus.FORBIDDEN,
      );
    }

    request.authProfile = profile;
    request.authScope = await this.permissionsService.getEffectiveScope(profile, required.module);
    return true;
  }
}
