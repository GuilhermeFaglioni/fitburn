import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Prisma } from "@prisma/client";
import { ErrorCode, ErrorStatus, type CurrentUser } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsersService, type UserWithProfile } from "../users/users.service.js";
import { hashPassword, verifyPassword } from "./password.util.js";
import { generateOpaqueToken, hashToken } from "./token.util.js";
import { refreshTokenTtlMs } from "./refresh-token-ttl.js";
import { lockUserRow } from "../users/user-row-lock.js";

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
    const credentials = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
    const passwordMatches = credentials
      ? await verifyPassword(password, credentials.passwordHash)
      : false;

    if (!credentials || !passwordMatches) throw this.invalidCredentials();

    return this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, credentials.id);
      const user = await tx.user.findUnique({
        where: { id: credentials.id },
        include: { profile: true },
      });

      // A senha ou o e-mail podem ter mudado enquanto o hash era verificado.
      if (!user || user.email !== email || user.passwordHash !== credentials.passwordHash) {
        throw this.invalidCredentials();
      }
      if (user.status !== "ACTIVE") {
        throw new DomainError(
          ErrorCode.USER_INACTIVE,
          "Este usuário está inativo. Fale com a administração da Fitburn.",
          ErrorStatus.UNAUTHENTICATED,
        );
      }

      return this.issueSession(tx, user);
    });
  }

  async changeOwnPassword(
    userId: string,
    tokenVersion: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResult> {
    const credentials = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!credentials) throw this.sessionExpired();
    if (!(await verifyPassword(currentPassword, credentials.passwordHash))) {
      throw this.currentPasswordInvalid();
    }

    const passwordHash = await hashPassword(newPassword);
    return this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, userId);
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      // A concurrent credential change may have invalidated the request after its guard ran.
      if (!user || user.status !== "ACTIVE" || user.tokenVersion !== tokenVersion) {
        throw this.sessionExpired();
      }
      if (user.passwordHash !== credentials.passwordHash) {
        throw this.currentPasswordInvalid();
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
        include: { profile: true },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return this.issueSession(tx, updatedUser);
    });
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
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });

    if (!existing) {
      throw this.sessionExpired();
    }

    const newRefreshToken = generateOpaqueToken();
    const now = new Date();
    const session = await this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, existing.userId);
      const user = await tx.user.findUnique({
        where: { id: existing.userId },
        include: { profile: true },
      });
      const currentToken = await tx.refreshToken.findUnique({ where: { id: existing.id } });

      if (!currentToken) return null;
      if (user && currentToken.tokenVersion !== user.tokenVersion) return null;
      if (currentToken.revokedAt) {
        // Reuso efetivo continua revogando as outras sessões da conta.
        await tx.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return null;
      }
      if (currentToken.expiresAt.getTime() <= now.getTime()) return null;
      if (!user || user.status !== "ACTIVE") return null;

      const result = await tx.refreshToken.updateMany({
        where: { id: currentToken.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });

      if (result.count !== 1) {
        const current = await tx.refreshToken.findUnique({
          where: { id: currentToken.id },
          select: { revokedAt: true },
        });
        if (current?.revokedAt) {
          // Uma corrida entre abas também conta como reuso: apenas um refresh vence e as sessões são revogadas.
          await tx.refreshToken.updateMany({
            where: { userId: existing.userId, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        return null;
      }

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(newRefreshToken),
          tokenVersion: user.tokenVersion,
          expiresAt: new Date(now.getTime() + refreshTokenTtlMs()),
        },
      });
      return {
        accessToken: await this.jwtService.signAsync({
          sub: user.id,
          tokenVersion: user.tokenVersion,
        }),
        user,
      };
    });
    if (!session) throw this.sessionExpired();

    return {
      accessToken: session.accessToken,
      refreshToken: newRefreshToken,
      user: await this.usersService.toCurrentUser(session.user),
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    tx: Prisma.TransactionClient,
    user: UserWithProfile,
  ): Promise<LoginResult> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = generateOpaqueToken();
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        tokenVersion: user.tokenVersion,
        expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
      },
    });

    return { accessToken, refreshToken, user: await this.usersService.toCurrentUser(user) };
  }

  private invalidCredentials(): DomainError {
    return new DomainError(
      ErrorCode.INVALID_CREDENTIALS,
      "Não foi possível entrar. Verifique seu e-mail e senha e tente novamente.",
      ErrorStatus.UNAUTHENTICATED,
    );
  }

  private currentPasswordInvalid(): DomainError {
    return new DomainError(
      ErrorCode.CURRENT_PASSWORD_INVALID,
      "A senha atual está incorreta.",
      ErrorStatus.VALIDATION,
    );
  }

  private sessionExpired(): DomainError {
    return new DomainError(
      ErrorCode.SESSION_EXPIRED,
      "Sessão expirada. Entre novamente.",
      ErrorStatus.UNAUTHENTICATED,
    );
  }
}
