CREATE TYPE "UserManifestationType" AS ENUM (
    'PRIVACY_ACKNOWLEDGED',
    'TERMS_ACCEPTED',
    'CONSENT_RANKING'
);

CREATE TYPE "UserManifestationAction" AS ENUM ('GRANTED', 'REVOKED');

CREATE TABLE "user_manifestations" (
    "id" TEXT NOT NULL,
    "type" "UserManifestationType" NOT NULL,
    "version" TEXT,
    "action" "UserManifestationAction" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_manifestations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_manifestations_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_manifestations_userId_type_createdAt_idx"
    ON "user_manifestations"("userId", "type", "createdAt");

CREATE FUNCTION "reject_user_manifestation_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'User manifestations are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "user_manifestations_append_only"
    BEFORE UPDATE OR DELETE ON "user_manifestations"
    FOR EACH ROW EXECUTE FUNCTION "reject_user_manifestation_mutation"();
