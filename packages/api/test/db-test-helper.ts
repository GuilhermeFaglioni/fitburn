import { readFileSync } from "node:fs";
import * as path from "node:path";
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

const NO_OVERLAP_CONSTRAINT = "class_occurrences_no_overlap";

/**
 * Tira do ar a exclusion constraint da agenda (espaço exclusivo), para testes
 * que precisam de aulas agendadas sobrepostas. Sempre em par com
 * ensureOccurrenceNoOverlapConstraint no afterAll.
 */
export async function dropOccurrenceNoOverlapConstraint(): Promise<void> {
  await testPrisma.$executeRawUnsafe(
    `ALTER TABLE "class_occurrences" DROP CONSTRAINT IF EXISTS "${NO_OVERLAP_CONSTRAINT}"`,
  );
}

/**
 * Recria a exclusion constraint se ela estiver faltando, com o DDL lido da
 * própria migration (sem cópia que possa divergir). Roda também no setup de
 * cada arquivo de teste: uma execução interrompida entre o drop e o afterAll
 * não deixa o banco de teste sem a constraint.
 */
export async function ensureOccurrenceNoOverlapConstraint(): Promise<void> {
  const existing = await testPrisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint WHERE conname = ${NO_OVERLAP_CONSTRAINT}
  `;
  if (existing.length > 0) return;

  const migration = readFileSync(
    path.resolve(
      __dirname,
      "../prisma/migrations/20260928011755_add_class_occurrences/migration.sql",
    ),
    "utf8",
  );
  const ddl = migration.match(
    new RegExp(
      `ALTER TABLE "class_occurrences"\\s+ADD CONSTRAINT "${NO_OVERLAP_CONSTRAINT}"[^;]*;`,
    ),
  );
  if (!ddl) throw new Error(`DDL de ${NO_OVERLAP_CONSTRAINT} não encontrado na migration.`);
  await cleanDatabase();
  await testPrisma.$executeRawUnsafe(ddl[0]);
}
