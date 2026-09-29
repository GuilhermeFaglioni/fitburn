-- AlterTable
ALTER TABLE "points_entries" ADD COLUMN     "milestone" INTEGER,
ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "streak_badges" (
    "id" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "awardedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "streak_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "streak_badges_clientId_milestone_key" ON "streak_badges"("clientId", "milestone");

-- AddForeignKey
ALTER TABLE "streak_badges" ADD CONSTRAINT "streak_badges_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
