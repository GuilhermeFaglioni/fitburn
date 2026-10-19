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
import { UsersService, type UserWithProfile } from "./users.service.js";
import { AllowDuringOnboarding } from "../onboarding/allow-during-onboarding.decorator.js";

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
  @AllowDuringOnboarding()
  async get(@Req() req: AuthenticatedRequest): Promise<UserDetail> {
    const user = await this.currentUser(req);
    return this.usersService.toUserDetailWithOnboarding(user);
  }

  @Patch()
  async update(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateOwnProfileRequestSchema)) body: UpdateOwnProfileRequest,
  ): Promise<UserDetail> {
    const current = await this.currentUser(req);
    const user = await this.usersService.update(current.id, body);
    return this.usersService.toUserDetail(user);
  }

  /** O usuário do token, se ainda existe e está ativo (o login recusa os inativos do mesmo jeito). */
  private async currentUser(req: AuthenticatedRequest): Promise<UserWithProfile> {
    const user = await this.usersService.findById(req.authUser.sub);
    if (!user) throw this.sessionInvalid();
    if (user.status !== "ACTIVE") {
      throw new DomainError(
        ErrorCode.USER_INACTIVE,
        "Este usuário está inativo. Fale com a administração da Fitburn.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }
    return user;
  }

  private sessionInvalid(): DomainError {
    return new DomainError(
      ErrorCode.UNAUTHENTICATED,
      "Sessão inválida ou expirada.",
      ErrorStatus.UNAUTHENTICATED,
    );
  }
}
