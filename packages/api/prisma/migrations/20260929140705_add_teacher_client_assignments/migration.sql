-- CreateTable
CREATE TABLE "teacher_client_assignments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teacherId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "teacher_client_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_client_assignments_clientId_idx" ON "teacher_client_assignments"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_client_assignments_teacherId_clientId_key" ON "teacher_client_assignments"("teacherId", "clientId");

-- AddForeignKey
ALTER TABLE "teacher_client_assignments" ADD CONSTRAINT "teacher_client_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_client_assignments" ADD CONSTRAINT "teacher_client_assignments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
