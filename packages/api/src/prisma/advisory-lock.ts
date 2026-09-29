import type { Prisma } from "@prisma/client";

/**
 * Lock consultivo da transação por chave (liberado no commit/rollback): quem
 * pede a mesma chave espera a fila. Cada regra de negócio usa o seu prefixo
 * (ex.: "reservation-client", "gamification-client") para não travar o que
 * não precisa. Em transações que também travam ocorrências, este vem depois.
 */
export async function lockAdvisory(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
