-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_clientId_status_idx" ON "reservations"("clientId", "status");

-- CreateIndex
CREATE INDEX "reservations_occurrenceId_status_idx" ON "reservations"("occurrenceId", "status");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "class_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Última linha de defesa contra reserva duplicada: no máximo uma reserva
-- confirmada por (cliente, ocorrência). O Prisma não modela índice parcial.
CREATE UNIQUE INDEX "reservations_client_occurrence_confirmed_key"
  ON "reservations" ("clientId", "occurrenceId")
  WHERE "status" = 'CONFIRMED';
