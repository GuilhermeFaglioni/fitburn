import type { Prisma, UserStatus } from "@prisma/client";

/** Serializes authentication issuance and account changes on the same user row. */
export async function lockUserRow(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<UserStatus | null> {
  const rows = await tx.$queryRaw<Array<{ status: UserStatus }>>`
    SELECT status::text AS status FROM users WHERE id = ${userId} FOR UPDATE
  `;
  return rows[0]?.status ?? null;
}
