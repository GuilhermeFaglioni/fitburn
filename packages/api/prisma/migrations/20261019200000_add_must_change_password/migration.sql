ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users" SET "mustChangePassword" = true;
