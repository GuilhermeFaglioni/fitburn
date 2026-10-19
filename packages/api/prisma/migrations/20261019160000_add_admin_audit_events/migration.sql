CREATE TYPE "AdminAuditAction" AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'USER_DELETED',
  'USER_PROFILE_CHANGED',
  'USER_PASSWORD_RESET',
  'PROFILE_PERMISSIONS_CHANGED'
);

CREATE TABLE "admin_audit_events" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "AdminAuditAction" NOT NULL,
  "targetId" TEXT NOT NULL,
  "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_events_actorId_createdAt_idx"
  ON "admin_audit_events"("actorId", "createdAt");
CREATE INDEX "admin_audit_events_targetId_createdAt_idx"
  ON "admin_audit_events"("targetId", "createdAt");

CREATE FUNCTION reject_admin_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Admin audit events are append-only';
END;
$$;

CREATE TRIGGER "admin_audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "admin_audit_events"
  FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_event_mutation();
