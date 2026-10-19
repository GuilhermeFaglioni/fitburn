import { type AdminAuditAction, type Prisma } from "@prisma/client";

export type AdminAuditEventInput = {
  actorId: string;
  action: AdminAuditAction;
  targetId: string;
  changedFields?: string[];
};

export async function recordAdminAuditEvent(
  tx: Prisma.TransactionClient,
  event: AdminAuditEventInput,
): Promise<void> {
  await tx.adminAuditEvent.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      targetId: event.targetId,
      changedFields: event.changedFields ?? [],
    },
  });
}
