-- CreateEnum
CREATE TYPE "GamificationRuleKind" AS ENUM ('ATTENDANCE_POINTS', 'GOAL_POINTS', 'STREAK_MILESTONE');

-- CreateEnum
CREATE TYPE "PointsEntryType" AS ENUM ('ATTENDANCE', 'GOAL', 'STREAK_BONUS', 'REVERSAL');

-- CreateTable
CREATE TABLE "gamification_rules" (
    "id" TEXT NOT NULL,
    "kind" "GamificationRuleKind" NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gamification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_entries" (
    "id" TEXT NOT NULL,
    "type" "PointsEntryType" NOT NULL,
    "points" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "reservationId" TEXT,

    CONSTRAINT "points_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gamification_rules_kind_threshold_key" ON "gamification_rules"("kind", "threshold");

-- CreateIndex
CREATE INDEX "points_entries_clientId_occurredAt_idx" ON "points_entries"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "points_entries_reservationId_idx" ON "points_entries"("reservationId");

-- AddForeignKey
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
