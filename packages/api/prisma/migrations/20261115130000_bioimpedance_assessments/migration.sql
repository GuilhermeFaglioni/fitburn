-- CreateEnum
CREATE TYPE "BioimpedanceSource" AS ENUM ('FOTO_DO_LAUDO', 'MANUAL');

-- AlterEnum
ALTER TYPE "Module" ADD VALUE 'BIOIMPEDANCIA';

-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'BIOIMPEDANCE_ASSESSMENT_DELETED';

-- CreateTable
CREATE TABLE "bioimpedance_assessments" (
    "id" TEXT NOT NULL,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "age" INTEGER,
    "source" "BioimpedanceSource" NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "measures" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "bioimpedance_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bioimpedance_assessments_measuredAt_idx" ON "bioimpedance_assessments"("measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "bioimpedance_assessments_clientId_measuredAt_key" ON "bioimpedance_assessments"("clientId", "measuredAt");

-- AddForeignKey
ALTER TABLE "bioimpedance_assessments" ADD CONSTRAINT "bioimpedance_assessments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bioimpedance_assessments" ADD CONSTRAINT "bioimpedance_assessments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
