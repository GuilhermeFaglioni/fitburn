import { Injectable } from "@nestjs/common";
import type { AccessProfile } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  type CreateProfileRequest,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
  type ProfileDetail,
  type UpdateProfileRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";

const SYSTEM_ADMIN_PROFILE_NAME = "Administrador";
const SYSTEM_CLIENT_PROFILE_NAME = "Cliente";

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<AccessProfile[]> {
    return this.prisma.accessProfile.findMany({ orderBy: { name: "asc" } });
  }

  async findByIdOrThrow(id: string): Promise<AccessProfile> {
    const profile = await this.prisma.accessProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Perfil de acesso não encontrado.", ErrorStatus.NOT_FOUND);
    }
    return profile;
  }

  async create(input: CreateProfileRequest): Promise<AccessProfile> {
    const existing = await this.prisma.accessProfile.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Já existe um perfil com este nome.",
        ErrorStatus.VALIDATION,
      );
    }

    return this.prisma.accessProfile.create({
      data: { name: input.name, description: input.description },
    });
  }

  async update(id: string, input: UpdateProfileRequest): Promise<AccessProfile> {
    await this.findByIdOrThrow(id);

    if (input.name !== undefined) {
      const existing = await this.prisma.accessProfile.findUnique({ where: { name: input.name } });
      if (existing && existing.id !== id) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          "Já existe um perfil com este nome.",
          ErrorStatus.VALIDATION,
        );
      }
    }

    return this.prisma.accessProfile.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  }

  async activate(id: string): Promise<AccessProfile> {
    await this.findByIdOrThrow(id);
    return this.prisma.accessProfile.update({ where: { id }, data: { isActive: true } });
  }

  async deactivate(id: string): Promise<AccessProfile> {
    const profile = await this.findByIdOrThrow(id);
    this.assertNotSystem(profile, "Perfis de sistema não podem ser desativados.");
    return this.prisma.accessProfile.update({ where: { id }, data: { isActive: false } });
  }

  async delete(id: string): Promise<void> {
    const profile = await this.findByIdOrThrow(id);
    this.assertNotSystem(profile, "Perfis de sistema não podem ser excluídos.");

    const usersCount = await this.prisma.user.count({ where: { profileId: id } });
    if (usersCount > 0) {
      throw new DomainError(
        ErrorCode.PROFILE_IN_USE,
        "Este perfil tem usuários vinculados e não pode ser excluído.",
        ErrorStatus.CONFLICT,
      );
    }

    await this.prisma.accessProfile.delete({ where: { id } });
  }

  async setModuleAccess(
    id: string,
    module: ModuleName,
    actions: PermissionActionName[],
    scope: PermissionScopeName,
  ): Promise<void> {
    const profile = await this.findByIdOrThrow(id);

    if (profile.isSystem && profile.name === SYSTEM_ADMIN_PROFILE_NAME) {
      throw new DomainError(
        ErrorCode.SYSTEM_PROFILE_IMMUTABLE,
        "As permissões do Administrador não podem ser alteradas — ele sempre tem acesso total.",
        ErrorStatus.UNPROCESSABLE,
      );
    }
    if (
      profile.isSystem &&
      profile.name === SYSTEM_CLIENT_PROFILE_NAME &&
      scope !== PermissionScope.OWN
    ) {
      throw new DomainError(
        ErrorCode.SYSTEM_PROFILE_IMMUTABLE,
        "O escopo do perfil Cliente é sempre 'registros próprios'.",
        ErrorStatus.UNPROCESSABLE,
      );
    }

    if (actions.length === 0) {
      await this.prisma.profileModuleAccess.deleteMany({ where: { profileId: id, module } });
      return;
    }

    await this.prisma.profileModuleAccess.upsert({
      where: { profileId_module: { profileId: id, module } },
      update: { actions, scope },
      create: { profileId: id, module, actions, scope },
    });
  }

  async toProfileDetail(profile: AccessProfile): Promise<ProfileDetail> {
    const rows = await this.prisma.profileModuleAccess.findMany({ where: { profileId: profile.id } });
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      isSystem: profile.isSystem,
      isActive: profile.isActive,
      moduleAccess: rows.map((row) => ({ module: row.module, actions: row.actions, scope: row.scope })),
    };
  }

  private assertNotSystem(profile: AccessProfile, message: string): void {
    if (profile.isSystem) {
      throw new DomainError(ErrorCode.SYSTEM_PROFILE_IMMUTABLE, message, ErrorStatus.UNPROCESSABLE);
    }
  }
}
