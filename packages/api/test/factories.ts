import type { AccessProfile, Module, PermissionAction, PermissionScope, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/auth/password.util.js";
import { testPrisma } from "./db-test-helper.js";

export function createAccessProfile(overrides: {
  name: string;
  isSystem?: boolean;
}): Promise<AccessProfile> {
  return testPrisma.accessProfile.create({
    data: { name: overrides.name, isSystem: overrides.isSystem ?? false },
  });
}

export async function createUser(overrides: {
  email: string;
  password: string;
  profileId: string;
  fullName?: string;
  status?: UserStatus;
}) {
  const passwordHash = await hashPassword(overrides.password);
  return testPrisma.user.create({
    data: {
      email: overrides.email,
      passwordHash,
      fullName: overrides.fullName ?? "Usuário de Teste",
      profileId: overrides.profileId,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

export function grantModuleAccess(overrides: {
  profileId: string;
  module: Module;
  actions: PermissionAction[];
  scope: PermissionScope;
}) {
  return testPrisma.profileModuleAccess.upsert({
    where: { profileId_module: { profileId: overrides.profileId, module: overrides.module } },
    update: { actions: overrides.actions, scope: overrides.scope },
    create: {
      profileId: overrides.profileId,
      module: overrides.module,
      actions: overrides.actions,
      scope: overrides.scope,
    },
  });
}
