import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Limpa todas as tabelas do schema de teste entre testes.
 * Genérico de propósito: novas tabelas de tickets futuros não exigem
 * atualizar este helper.
 */
export async function cleanDatabase(): Promise<void> {
  const tables = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const tableNames = tables
    .map((t: { tablename: string }) => `"public"."${t.tablename}"`)
    .join(", ");
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
}
