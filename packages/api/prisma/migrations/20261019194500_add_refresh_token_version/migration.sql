ALTER TABLE "refresh_tokens" ADD COLUMN "tokenVersion" INTEGER;

UPDATE "refresh_tokens" AS refresh_token
SET "tokenVersion" = user_record."tokenVersion"
FROM "users" AS user_record
WHERE user_record."id" = refresh_token."userId";

ALTER TABLE "refresh_tokens" ALTER COLUMN "tokenVersion" SET DEFAULT 0;
ALTER TABLE "refresh_tokens" ALTER COLUMN "tokenVersion" SET NOT NULL;
