import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../auth/password.util.js";
import { seedGamificationRules } from "../gamification/default-rules.js";

/** Cliente completo ou uma transação interativa dele. */
export type SeedClient = Pick<
  PrismaClient,
  "accessProfile" | "profileModuleAccess" | "gamificationRule" | "user"
>;

/**
 * Dados base do sistema: perfis de sistema, permissões do perfil Cliente,
 * regras de gamificação e o administrador inicial (lido do ambiente).
 * Idempotente: só cria o que falta e nunca sobrescreve o que já existe.
 * Compartilhado pelo seed do Prisma (`prisma/seed.ts`) e pelo reset da demo.
 */
export async function seedBaseData(
  prisma: SeedClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ adminEmail: string }> {
  const email = env.INITIAL_ADMIN_EMAIL;
  const password = env.INITIAL_ADMIN_PASSWORD;
  const fullName = env.INITIAL_ADMIN_NAME;
  if (!email || !password || !fullName) {
    throw new Error(
      "INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD e INITIAL_ADMIN_NAME são obrigatórios para o seed (veja .env.example).",
    );
  }

  const adminProfile = await prisma.accessProfile.upsert({
    where: { name: "Administrador" },
    update: {},
    create: { name: "Administrador", isSystem: true },
  });
  const clientProfile = await prisma.accessProfile.upsert({
    where: { name: "Cliente" },
    update: {},
    create: { name: "Cliente", isSystem: true },
  });

  // Administrador não precisa de linhas aqui: o motor de autorização sempre
  // libera tudo para o perfil de sistema Administrador (PermissionsService).
  await prisma.profileModuleAccess.upsert({
    where: { profileId_module: { profileId: clientProfile.id, module: "USUARIOS" } },
    update: { actions: ["VIEW"], scope: "OWN" },
    create: {
      profileId: clientProfile.id,
      module: "USUARIOS",
      actions: ["VIEW"],
      scope: "OWN",
    },
  });

  await seedGamificationRules(prisma);

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName, profileId: adminProfile.id },
  });

  return { adminEmail: email };
}
