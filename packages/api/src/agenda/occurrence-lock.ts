import type { Prisma } from "@prisma/client";

/**
 * Trava as linhas das ocorrências (FOR UPDATE) em ordem determinística, por
 * id. É o lock que serializa tudo o que depende das vagas de uma aula: o
 * motor de reserva e as alterações administrativas. Ordem de locks do
 * sistema: ocorrências primeiro, depois o lock do cliente — nunca o inverso.
 */
export async function lockOccurrenceRows(
  tx: Prisma.TransactionClient,
  occurrenceIds: string[],
): Promise<void> {
  for (const id of [...occurrenceIds].sort()) {
    await tx.$queryRaw`SELECT id FROM class_occurrences WHERE id = ${id} FOR UPDATE`;
  }
}
