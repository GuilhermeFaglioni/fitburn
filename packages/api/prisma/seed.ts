import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.util.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
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

  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const fullName = process.env.INITIAL_ADMIN_NAME;
  if (!email || !password || !fullName) {
    throw new Error(
      "INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD e INITIAL_ADMIN_NAME são obrigatórios para o seed (veja .env.example).",
    );
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName, profileId: adminProfile.id },
  });

  console.log(`Seed concluído: administrador inicial "${email}" pronto.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
