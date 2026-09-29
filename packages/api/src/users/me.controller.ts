import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import {
  ErrorCode,
  ErrorStatus,
  updateOwnProfileRequestSchema,
  type UpdateOwnProfileRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { DomainError } from "../common/errors/domain-error.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { UsersService } from "./users.service.js";

/**
 * Perfil / Minha conta: os dados pessoais do próprio usuário autenticado.
 * Sem @RequirePermission de propósito: qualquer usuário (cliente ou equipe)
 * vê e edita os próprios dados; o id vem sempre do token, nunca da URL.
 */
@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<UserDetail> {
    const user = await this.usersService.findById(req.authUser.sub);
    if (!user) throw this.sessionInvalid();
    return this.usersService.toUserDetail(user);
  }

  @Patch()
  async update(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateOwnProfileRequestSchema)) body: UpdateOwnProfileRequest,
  ): Promise<UserDetail> {
    if (!(await this.usersService.findById(req.authUser.sub))) throw this.sessionInvalid();
    const user = await this.usersService.update(req.authUser.sub, body);
    return this.usersService.toUserDetail(user);
  }

  private sessionInvalid(): DomainError {
    return new DomainError(
      ErrorCode.UNAUTHENTICATED,
      "Sessão inválida ou expirada.",
      ErrorStatus.UNAUTHENTICATED,
    );
  }
}
