-- CreateEnum
CREATE TYPE "WorkoutSheetStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "workout_sheets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "WorkoutSheetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "workout_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sets" TEXT,
    "reps" TEXT,
    "load" TEXT,
    "duration" TEXT,
    "distance" TEXT,
    "notes" TEXT,
    "sheetId" TEXT NOT NULL,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_sheets_clientId_status_idx" ON "workout_sheets"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workout_exercises_sheetId_position_key" ON "workout_exercises"("sheetId", "position");

-- AddForeignKey
ALTER TABLE "workout_sheets" ADD CONSTRAINT "workout_sheets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sheets" ADD CONSTRAINT "workout_sheets_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "workout_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

