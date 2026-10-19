import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { AccessProfile } from "@prisma/client";
import { ErrorCode, ErrorStatus, type PermissionScopeName } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

export interface AuthTokenPayload {
  sub: string;
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

    // O token segue válido por alguns minutos depois de a pessoa ser excluída
    // (anonimizada): quem foi excluído perde o acesso na hora, em toda rota
    // autenticada. INACTIVE não é barrado aqui para que controladores de
    // domínio retornem USER_INACTIVE; rotas de equipe são barradas pelo
    // PermissionsGuard.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (user?.status === "DELETED") {
      throw this.unauthenticated();
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
