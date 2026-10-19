import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AccessProfile } from "@prisma/client";
import { ErrorCode, ErrorStatus, type PermissionScopeName } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getOnboardingPending } from "../onboarding/onboarding-requirements.js";
import { ALLOW_DURING_ONBOARDING } from "../onboarding/allow-during-onboarding.decorator.js";

export interface AuthTokenPayload {
  sub: string;
  tokenVersion: number;
}

export interface AuthenticatedRequest extends Request {
  authUser: AuthTokenPayload;
  /** Preenchidos pelo PermissionsGuard quando a rota declara @RequirePermission. */
  authProfile?: AccessProfile;
  /** Escopo efetivo no módulo exigido pela rota. */
  authScope?: PermissionScopeName;
  /** Escopo efetivo de CLIENTES, usado para projetar dados em qualquer módulo. */
  authClientScope?: PermissionScopeName;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw this.unauthenticated();
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw this.unauthenticated();
    }

    // Revoga imediatamente tokens de usuários ausentes, inativos ou com senha
    // redefinida desde a emissão do access token.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, tokenVersion: true, mustChangePassword: true },
    });
    if (!user) {
      throw this.unauthenticated();
    }
    if (user.status !== "ACTIVE") {
      throw new DomainError(
        ErrorCode.USER_INACTIVE,
        "Este usuário está inativo. Fale com a administração da Fitburn.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }
    if (user.tokenVersion !== payload.tokenVersion) throw this.unauthenticated();

    const onboardingPending = getOnboardingPending(user);
    const isOnboardingRoute = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_ONBOARDING, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (onboardingPending.length > 0 && !isOnboardingRoute) {
      throw new DomainError(
        ErrorCode.ONBOARDING_REQUIRED,
        "Conclua as etapas obrigatórias antes de continuar.",
        ErrorStatus.FORBIDDEN,
        { pending: onboardingPending },
      );
    }

    request.authUser = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    return header.slice("Bearer ".length);
  }

  private unauthenticated(): DomainError {
    return new DomainError(
      ErrorCode.UNAUTHENTICATED,
      "Sessão inválida ou expirada.",
      ErrorStatus.UNAUTHENTICATED,
    );
  }
}
