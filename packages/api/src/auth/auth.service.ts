import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ErrorCode, ErrorStatus, type CurrentUser } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsersService } from "../users/users.service.js";
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

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
