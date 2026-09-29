import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma, type AccessProfile, type User, type UserStatus } from "@prisma/client";
import {
  dateOnlyToLocalDate,
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  SystemProfileName,
  type CreateClientRequest,
  type CreateStaffRequest,
  type CurrentUser,
  type PermissionScopeName,
  type UpdateUserRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { isUniqueViolation } from "../prisma/unique-violation.js";
import { PermissionsService } from "../permissions/permissions.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { hashPassword } from "../auth/password.util.js";

export type UserWithProfile = User & { profile: AccessProfile };

const CLIENT_PROFILE_NAME = "Cliente";

/** Nome neutro de quem foi excluído (anonimizado). */
export const DELETED_USER_NAME = "Usuário excluído";

/** E-mail único e não roteável (TLD reservado `.invalid`) de quem foi excluído. */
export function deletedUserEmail(userId: string): string {
  return `excluido-${userId}@anonimizado.invalid`;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  findByEmail(email: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  }

  findById(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async list(
    filters: { profileId?: string; status?: UserStatus },
    scope: PermissionScopeName,
    requesterId: string,
  ): Promise<UserWithProfile[]> {
    // Excluídos (anonimizados) nunca aparecem em listagens.
    const where: Prisma.UserWhereInput = {
      status: filters.status ?? { not: "DELETED" },
      ...(filters.profileId ? { profileId: filters.profileId } : {}),
    };

    // Nenhum perfil concede ASSIGNED_CLIENTS/ASSIGNED_CLASSES para o módulo
    // Usuários ainda — tratar qualquer coisa que não seja ALL como "só eu
    // mesmo" é a leitura mais restritiva e segura por padrão.
    if (scope !== PermissionScope.ALL) {
      where.id = requesterId;
    }

    return this.prisma.user.findMany({
      where,
      include: { profile: true },
      orderBy: { fullName: "asc" },
    });
  }

  async createClient(input: CreateClientRequest): Promise<UserWithProfile> {
    const clientProfile = await this.getSystemProfile(CLIENT_PROFILE_NAME);
    await this.assertEmailAvailable(input.email);
    await this.assertDocumentAvailable(input.document);
    const passwordHash = await hashPassword(input.password);

    return this.prisma.user
      .create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          phone: input.phone,
          birthDate: new Date(input.birthDate),
          document: input.document,
          address: input.address,
          profileId: clientProfile.id,
        },
        include: { profile: true },
      })
      .catch((error: unknown) => this.rethrowUniqueViolation(error, input.email, input.document));
  }

  async createStaff(input: CreateStaffRequest): Promise<UserWithProfile> {
    const profile = await this.getExistingProfile(input.profileId);
    await this.assertEmailAvailable(input.email);
    const passwordHash = await hashPassword(input.password);

    return this.prisma.user
      .create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          profileId: profile.id,
        },
        include: { profile: true },
      })
      .catch((error: unknown) => this.rethrowUniqueViolation(error, input.email));
  }

  async update(id: string, input: UpdateUserRequest): Promise<UserWithProfile> {
    if (input.profileId !== undefined) {
      await this.getExistingProfile(input.profileId);
    }
    if (input.email !== undefined) {
      await this.assertEmailAvailable(input.email, id);
    }
    if (input.document) {
      await this.assertDocumentAvailable(input.document, id);
    }

    return this.updateRow(id, input).catch((error: unknown) =>
      this.rethrowUniqueViolation(error, input.email, input.document, id),
    );
  }

  private updateRow(id: string, input: UpdateUserRequest): Promise<UserWithProfile> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveUser(tx, id);
      return tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.birthDate !== undefined
            ? { birthDate: input.birthDate ? new Date(input.birthDate) : null }
            : {}),
          ...(input.document !== undefined ? { document: input.document } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.profileId !== undefined ? { profileId: input.profileId } : {}),
        },
        include: { profile: true },
      });
    });
  }

  async deactivate(id: string): Promise<UserWithProfile> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveUser(tx, id);
      const user = await tx.user.update({
        where: { id },
        data: { status: "INACTIVE" },
        include: { profile: true },
      });
      await this.revokeSessions(tx, id);
      return user;
    });
  }

  reactivate(id: string): Promise<UserWithProfile> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveUser(tx, id);
      return tx.user.update({
        where: { id },
        data: { status: "ACTIVE" },
        include: { profile: true },
      });
    });
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await this.lockLiveUser(tx, id);
      await tx.user.update({ where: { id }, data: { passwordHash } });
    });
  }

  /**
   * Exclusão com anonimização, numa única transação: os dados pessoais viram
   * valores neutros, o e-mail vira um placeholder único e não roteável
   * (`.invalid`), o documento é liberado, a senha deixa de existir, o status
   * vira DELETED (distinto de INACTIVE, sem volta) e as sessões são
   * revogadas. Nenhuma referência histórica (reservas, presenças, pontos,
   * planos, fichas) é tocada.
   */
  async anonymize(id: string): Promise<UserWithProfile> {
    // Hash de uma senha aleatória descartada: ninguém conhece, ninguém entra.
    const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveUser(tx, id);
      await this.assertNotLastAdmin(tx, id);
      const user = await tx.user.update({
        where: { id },
        data: {
          fullName: DELETED_USER_NAME,
          email: deletedUserEmail(id),
          passwordHash,
          phone: null,
          birthDate: null,
          document: null,
          address: null,
          status: "DELETED",
        },
        include: { profile: true },
      });
      await this.revokeSessions(tx, id);
      return user;
    });
  }

  /**
   * O sistema nunca fica sem administrador ativo: excluir o último é recusado.
   * O lock consultivo serializa exclusões simultâneas (dois administradores
   * excluindo um ao outro), senão ambos veriam "sobra o outro" e passariam.
   */
  private async assertNotLastAdmin(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await lockAdvisory(tx, "users-last-admin");
    const adminWhere = {
      status: "ACTIVE",
      profile: { name: SystemProfileName.ADMIN, isSystem: true },
    } satisfies Prisma.UserWhereInput;
    const isActiveAdmin = await tx.user.count({ where: { id, ...adminWhere } });
    if (isActiveAdmin === 0) return;
    const otherAdmins = await tx.user.count({ where: { ...adminWhere, id: { not: id } } });
    if (otherAdmins === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Não é possível excluir o último administrador ativo. Cadastre ou reative outro administrador antes.",
        ErrorStatus.VALIDATION,
      );
    }
  }

  private revokeSessions(tx: Prisma.TransactionClient, userId: string) {
    return tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Trava a linha do usuário (FOR UPDATE) e garante que existe e não foi
   * excluído: uma exclusão concorrente não pode ser desfeita por edição,
   * reativação ou troca de senha, nem duas exclusões passarem juntas.
   */
  private async lockLiveUser(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM users WHERE id = ${id} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Usuário não encontrado.", ErrorStatus.NOT_FOUND);
    }
    if (rows[0].status === "DELETED") {
      throw new DomainError(
        ErrorCode.USER_ALREADY_DELETED,
        "Este usuário já foi excluído.",
        ErrorStatus.CONFLICT,
      );
    }
  }

  async toCurrentUser(user: UserWithProfile): Promise<CurrentUser> {
    const permissions = await this.permissionsService.getEffectivePermissions(user.profile);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      profile: { id: user.profile.id, name: user.profile.name },
      permissions,
    };
  }

  toUserDetail(user: UserWithProfile): UserDetail {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      birthDate: user.birthDate ? dateOnlyToLocalDate(user.birthDate) : null,
      document: user.document,
      address: user.address,
      status: user.status,
      profile: { id: user.profile.id, name: user.profile.name },
    };
  }

  private async getSystemProfile(name: string): Promise<AccessProfile> {
    const profile = await this.prisma.accessProfile.findUnique({ where: { name } });
    if (!profile) {
      throw new Error(`Perfil de sistema "${name}" não encontrado — rode o seed.`);
    }
    return profile;
  }

  private async getExistingProfile(profileId: string): Promise<AccessProfile> {
    const profile = await this.prisma.accessProfile.findUnique({ where: { id: profileId } });
    if (!profile) {
      throw new DomainError(
        ErrorCode.PROFILE_NOT_FOUND,
        "O perfil de acesso selecionado não existe.",
        ErrorStatus.VALIDATION,
      );
    }
    return profile;
  }

  // Checagem proativa (mensagem amigável no caso comum). Com o driver
  // adapter-pg o Prisma não preenche error.meta.target (vem {}), então a
  // violação de unicidade de uma corrida real não diz qual coluna colidiu:
  // ver rethrowUniqueViolation.
  /**
   * Duas requisições simultâneas passam juntas pela checagem proativa e a
   * segunda esbarra no unique do banco (P2002). Refaz a checagem, agora com a
   * linha da vencedora já gravada, para devolver o erro de domínio certo
   * (e-mail ou documento em uso), nunca um 500.
   */
  private async rethrowUniqueViolation(
    error: unknown,
    email: string | undefined,
    document?: string | null,
    excludeUserId?: string,
  ): Promise<never> {
    if (isUniqueViolation(error)) {
      if (email !== undefined) await this.assertEmailAvailable(email, excludeUserId);
      await this.assertDocumentAvailable(document, excludeUserId);
    }
    throw error;
  }

  private async assertEmailAvailable(email: string, excludeUserId?: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== excludeUserId) {
      throw new DomainError(
        ErrorCode.EMAIL_ALREADY_IN_USE,
        "Este e-mail já está em uso.",
        ErrorStatus.CONFLICT,
      );
    }
  }

  private async assertDocumentAvailable(
    document: string | null | undefined,
    excludeUserId?: string,
  ): Promise<void> {
    if (!document) return;
    const existing = await this.prisma.user.findUnique({ where: { document } });
    if (existing && existing.id !== excludeUserId) {
      throw new DomainError(
        ErrorCode.DOCUMENT_ALREADY_IN_USE,
        "Este documento já está em uso.",
        ErrorStatus.CONFLICT,
      );
    }
  }
}
