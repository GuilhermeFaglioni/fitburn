import { Injectable } from "@nestjs/common";
import type { AccessProfile } from "@prisma/client";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  PermissionScope,
  type EffectivePermission,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

const SYSTEM_ADMIN_PROFILE_NAME = "Administrador";
const SYSTEM_CLIENT_PROFILE_NAME = "Cliente";

/**
 * Motor de autorização: módulo × ação × escopo, lido do banco a cada
 * requisição (sem cache — D-011). Dois invariantes de perfil de sistema são
 * aplicados aqui, na leitura, como rede de segurança independente de
 * qualquer tela de edição futura (Fase 1 T8):
 * - Administrador sempre tem acesso total, sem precisar de linhas na tabela;
 * - Cliente nunca tem escopo mais amplo que "OWN" (registros próprios).
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfileForUser(userId: string): Promise<AccessProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    return user?.profile ?? null;
  }

  async hasPermission(
    profile: AccessProfile,
    module: ModuleName,
    action: PermissionActionName,
  ): Promise<boolean> {
    if (this.isSystemAdmin(profile)) return true;

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

    const rows = await this.prisma.profileModuleAccess.findMany({ where: { profileId: profile.id } });
    return rows.map((row) => ({
      module: row.module,
      actions: row.actions,
      scope: this.enforceScopeFloor(profile, row.scope),
    }));
  }

  private isSystemAdmin(profile: AccessProfile): boolean {
    return profile.isSystem && profile.name === SYSTEM_ADMIN_PROFILE_NAME;
  }

  private enforceScopeFloor(profile: AccessProfile, scope: PermissionScopeName): PermissionScopeName {
    if (profile.isSystem && profile.name === SYSTEM_CLIENT_PROFILE_NAME) {
      return PermissionScope.OWN;
    }
    return scope;
  }
}
