import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { ErrorCode, ErrorStatus } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";

export interface AuthTokenPayload {
  sub: string;
}

export interface AuthenticatedRequest extends Request {
  authUser: AuthTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw this.unauthenticated();
    }

    try {
      request.authUser = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
      return true;
    } catch {
      throw this.unauthenticated();
    }
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
