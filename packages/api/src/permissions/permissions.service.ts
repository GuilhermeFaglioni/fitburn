import { Injectable } from "@nestjs/common";
import type { AccessProfile } from "@prisma/client";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  type EffectivePermission,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

const SYSTEM_ADMIN_PROFILE_NAME = "Administrador";
const SYSTEM_CLIENT_PROFILE_NAME = "Cliente";

const SCOPE_RANK: Record<PermissionScopeName, number> = {
  [PermissionScope.OWN]: 0,
  [PermissionScope.ASSIGNED_CLIENTS]: 1,
  [PermissionScope.ASSIGNED_CLASSES]: 1,
  [PermissionScope.ALL]: 2,
};

/**
 * Motor de autorização: módulo × ação × escopo, lido do banco a cada
 * requisição (sem cache — D-011). Invariantes de perfil de sistema são
 * aplicados aqui, na leitura, como rede de segurança independente de
 * qualquer regra de edição (Fase 1 T8):
 * - Administrador sempre tem acesso total, sem precisar de linhas na tabela;
 * - Cliente nunca tem escopo mais amplo que "OWN" (registros próprios);
 * - um perfil não-sistema inativo não concede nenhuma permissão.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfileForUser(userId: string): Promise<AccessProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    // Excluído (anonimizado) perde o acesso na hora, mesmo com um token ainda
    // válido (o JwtAuthGuard já barra; aqui é rede de segurança).
    if (user?.status === "DELETED") return null;
    return user?.profile ?? null;
  }

  async hasPermission(
    profile: AccessProfile,
    module: ModuleName,
    action: PermissionActionName,
  ): Promise<boolean> {
    if (this.isSystemAdmin(profile)) return true;
    if (!profile.isActive) return false;

    const access = await this.prisma.profileModuleAccess.findUnique({
      where: { profileId_module: { profileId: profile.id, module } },
    });
    return access?.actions.includes(action) ?? false;
  }

  async getEffectiveScope(profile: AccessProfile, module: ModuleName): Promise<PermissionScopeName> {
    if (this.isSystemAdmin(profile)) return PermissionScope.ALL;

    const access = await this.prisma.profileModuleAccess.findUnique({
      where: { profileId_module: { profileId: profile.id, module } },
    });
    return this.enforceScopeFloor(profile, access?.scope ?? PermissionScope.OWN);
  }

  async getEffectivePermissions(profile: AccessProfile): Promise<EffectivePermission[]> {
    if (this.isSystemAdmin(profile)) {
      return ALL_MODULES.map((module) => ({
        module,
        actions: ALL_PERMISSION_ACTIONS,
        scope: PermissionScope.ALL,
      }));
    }
    if (!profile.isActive) return [];

    const rows = await this.prisma.profileModuleAccess.findMany({ where: { profileId: profile.id } });
    return rows.map((row) => ({
      module: row.module,
      actions: row.actions,
      scope: this.enforceScopeFloor(profile, row.scope),
    }));
  }

  /**
   * Confirma que um ator só está concedendo permissões efetivas que já possui.
   * `target` pode ser outro perfil ou a linha de matriz que será gravada.
   */
  async assertCanGrant(
    actorProfile: AccessProfile,
    target: AccessProfile | EffectivePermission,
  ): Promise<void> {
    if (this.isSystemAdmin(actorProfile)) return;

    const grants = "id" in target ? await this.getEffectivePermissions(target) : [target];
    const actorPermissions = await this.getEffectivePermissions(actorProfile);

    for (const grant of grants) {
      const actorPermission = actorPermissions.find((permission) => permission.module === grant.module);
      const actorScope = await this.getEffectiveScope(actorProfile, grant.module);
      const actionExceedsActor = grant.actions.some(
        (action) => !actorPermission?.actions.includes(action),
      );
      const scopeExceedsActor = SCOPE_RANK[grant.scope] > SCOPE_RANK[actorScope];

      if (actionExceedsActor || scopeExceedsActor) {
        throw new DomainError(
          ErrorCode.FORBIDDEN,
          "Você só pode conceder permissões iguais ou inferiores às que possui.",
          ErrorStatus.FORBIDDEN,
        );
      }
    }
  }

  async assertCanAssignProfile(actorProfile: AccessProfile, targetProfile: AccessProfile): Promise<void> {
    if (this.isSystemAdmin(actorProfile)) return;
    if (this.isSystemAdmin(targetProfile)) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        "Apenas um administrador do sistema pode atribuir o perfil Administrador.",
        ErrorStatus.FORBIDDEN,
      );
    }

    await this.assertCanGrant(actorProfile, targetProfile);
  }

  isSystemAdmin(profile: AccessProfile): boolean {
    return profile.isSystem && profile.name === SYSTEM_ADMIN_PROFILE_NAME;
  }

  private enforceScopeFloor(profile: AccessProfile, scope: PermissionScopeName): PermissionScopeName {
    if (profile.isSystem && profile.name === SYSTEM_CLIENT_PROFILE_NAME) {
      return PermissionScope.OWN;
    }
    return scope;
  }
}
