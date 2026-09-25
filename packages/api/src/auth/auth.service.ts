import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ErrorCode, ErrorStatus, type CurrentUser } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsersService, type UserWithProfile } from "../users/users.service.js";
import { verifyPassword } from "./password.util.js";
import { generateOpaqueToken, hashToken } from "./token.util.js";
import { refreshTokenTtlMs } from "./refresh-token-ttl.js";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: CurrentUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.usersService.findByEmail(email);
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        "Não foi possível entrar. Verifique seu e-mail e senha e tente novamente.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }

    if (user.status !== "ACTIVE") {
      throw new DomainError(
        ErrorCode.USER_INACTIVE,
        "Este usuário está inativo. Fale com a administração da Fitburn.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }

    return this.issueSession(user);
  }

  /**
   * Rotação com detecção de reuso: cada refresh troca o token por um novo e
   * revoga o antigo na mesma transação. Se o token apresentado já estava
   * revogado, é sinal de reuso de um token roubado — revoga todas as
   * sessões do usuário, não só esta, e recusa.
   */
  async refresh(rawRefreshToken: string | undefined): Promise<LoginResult> {
    if (!rawRefreshToken) {
      throw this.sessionExpired();
    }

    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw this.sessionExpired();
    }

    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw this.sessionExpired();
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw this.sessionExpired();
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user || user.status !== "ACTIVE") {
      throw this.sessionExpired();
    }

    const newRefreshToken = generateOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(newRefreshToken),
          expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
        },
      }),
    ]);

    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: await this.usersService.toCurrentUser(user),
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: UserWithProfile): Promise<LoginResult> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    const refreshToken = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
      },
    });

    return { accessToken, refreshToken, user: await this.usersService.toCurrentUser(user) };
  }

  private sessionExpired(): DomainError {
    return new DomainError(
      ErrorCode.SESSION_EXPIRED,
      "Sessão expirada. Entre novamente.",
      ErrorStatus.UNAUTHENTICATED,
    );
  }
}
