-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "createdById" TEXT,
ADD COLUMN "cancelledById" TEXT;

-- Antes das reservas administrativas só o próprio cliente reservava e cancelava.
UPDATE "reservations" SET "createdById" = "clientId";
UPDATE "reservations" SET "cancelledById" = "clientId" WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
