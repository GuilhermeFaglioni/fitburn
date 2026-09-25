-- CreateEnum
CREATE TYPE "Module" AS ENUM ('USUARIOS', 'PERFIS_DE_ACESSO', 'DASHBOARD', 'TEMPLATES_DE_AULA', 'OCORRENCIAS', 'RESERVAS', 'CLIENTES', 'PLANOS', 'PRESENCA', 'FICHAS_DE_TREINO', 'GAMIFICACAO');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXECUTE');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('ALL', 'ASSIGNED_CLIENTS', 'ASSIGNED_CLASSES', 'OWN');

-- CreateTable
CREATE TABLE "profile_module_access" (
    "id" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "actions" "PermissionAction"[],
    "scope" "PermissionScope" NOT NULL,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "profile_module_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_module_access_profileId_module_key" ON "profile_module_access"("profileId", "module");

-- AddForeignKey
ALTER TABLE "profile_module_access" ADD CONSTRAINT "profile_module_access_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "access_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
