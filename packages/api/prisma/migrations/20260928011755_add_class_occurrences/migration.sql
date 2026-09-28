-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "class_occurrences" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "modalityId" TEXT NOT NULL,
    "instructorId" TEXT,

    CONSTRAINT "class_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_occurrences_startsAt_idx" ON "class_occurrences"("startsAt");

-- CreateIndex
CREATE INDEX "class_occurrences_instructorId_idx" ON "class_occurrences"("instructorId");

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_modalityId_fkey" FOREIGN KEY ("modalityId") REFERENCES "modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Espaço exclusivo: duas ocorrências não canceladas nunca se sobrepõem no
-- tempo. Intervalo semiaberto [início, fim): uma aula pode começar
-- exatamente quando a anterior termina. Concorrente-seguro (dois
-- administradores criando ao mesmo tempo). O Prisma não modela EXCLUDE,
-- por isso ela vive só aqui.
ALTER TABLE "class_occurrences"
  ADD CONSTRAINT "class_occurrences_no_overlap"
  EXCLUDE USING gist (tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" = 'SCHEDULED');

ALTER TABLE "class_occurrences"
  ADD CONSTRAINT "class_occurrences_valid_interval" CHECK ("endsAt" > "startsAt");
