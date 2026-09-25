import { Injectable } from "@nestjs/common";
import { Prisma, type AccessProfile, type User, type UserStatus } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  type CreateClientRequest,
  type CreateStaffRequest,
  type CurrentUser,
  type PermissionScopeName,
  type UpdateUserRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { PermissionsService } from "../permissions/permissions.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { hashPassword } from "../auth/password.util.js";

export type UserWithProfile = User & { profile: AccessProfile };

const CLIENT_PROFILE_NAME = "Cliente";

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
    const where: Prisma.UserWhereInput = {
      ...(filters.profileId ? { profileId: filters.profileId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    // Nenhum perfil concede ASSIGNED_CLIENTS/ASSIGNED_CLASSES para o módulo
    // Usuários ainda — tratar qualquer coisa que não seja ALL como "só eu
    // mesmo" é a leitura mais restritiva e segura por padrão.
    if (scope !== PermissionScope.ALL) {
      where.id = requesterId;
    }

    return this.prisma.user.findMany({ where, include: { profile: true }, orderBy: { fullName: "asc" } });
  }

  async createClient(input: CreateClientRequest): Promise<UserWithProfile> {
    const clientProfile = await this.getSystemProfile(CLIENT_PROFILE_NAME);
    await this.assertEmailAvailable(input.email);
    await this.assertDocumentAvailable(input.document);
    const passwordHash = await hashPassword(input.password);

    return this.prisma.user.create({
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
    });
  }

  async createStaff(input: CreateStaffRequest): Promise<UserWithProfile> {
    const profile = await this.getExistingProfile(input.profileId);
    await this.assertEmailAvailable(input.email);
    const passwordHash = await hashPassword(input.password);

    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        profileId: profile.id,
      },
      include: { profile: true },
    });
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

    return this.prisma.user.update({
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
  }

  async deactivate(id: string): Promise<UserWithProfile> {
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { status: "INACTIVE" },
        include: { profile: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return user;
  }

  reactivate(id: string): Promise<UserWithProfile> {
    return this.prisma.user.update({
      where: { id },
      data: { status: "ACTIVE" },
      include: { profile: true },
    });
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
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
      birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
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

  // Checagem proativa em vez de traduzir a violação de unicidade do
  // Postgres: com o driver adapter-pg, o Prisma não preenche
  // error.meta.target (vem {}), então não dá para descobrir qual coluna
  // colidiu a partir do erro. A constraint do banco continua como rede de
  // segurança final contra uma corrida real, só não vira uma mensagem
  // amigável nesse caso raríssimo.
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
