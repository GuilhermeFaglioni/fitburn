-- AlterTable
ALTER TABLE "points_entries" ADD COLUMN     "reversesEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "points_entries_reversesEntryId_key" ON "points_entries"("reversesEntryId");

-- AddForeignKey
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "points_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
