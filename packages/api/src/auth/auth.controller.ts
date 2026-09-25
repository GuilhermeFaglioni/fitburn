import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  ErrorCode,
  ErrorStatus,
  loginRequestSchema,
  type CurrentUser,
  type LoginRequest,
  type LoginResponse,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { UsersService } from "../users/users.service.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard, type AuthenticatedRequest } from "./jwt-auth.guard.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { accessToken, refreshToken, user } = await this.authService.login(
      body.email,
      body.password,
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { accessToken, refreshToken, user } = await this.authService.refresh(
      readRefreshCookie(req),
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: AuthenticatedRequest): Promise<CurrentUser> {
    const user = await this.usersService.findById(req.authUser.sub);
    if (!user) {
      throw new DomainError(
        ErrorCode.UNAUTHENTICATED,
        "Sessão inválida ou expirada.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }
    return this.usersService.toCurrentUser(user);
  }
}
