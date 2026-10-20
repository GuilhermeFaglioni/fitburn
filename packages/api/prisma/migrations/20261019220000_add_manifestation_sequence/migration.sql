-- AlterTable
ALTER TABLE "user_manifestations" ADD COLUMN "sequence" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "user_manifestations_type_userId_sequence_idx"
    ON "user_manifestations"("type", "userId", "sequence");
