import { readFileSync } from "node:fs";
import { testPrisma } from "./db-test-helper.js";

const MIGRATION_PATH = new URL(
  "../prisma/migrations/20261019200000_add_must_change_password/migration.sql",
  import.meta.url,
);

describe("Migration de troca obrigatória de senha", () => {
  it("marca todas as contas anteriores e mantém falso como padrão para novas contas", async () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "users" (id integer PRIMARY KEY) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe('INSERT INTO "users" (id) VALUES (1), (2)');

      for (const statement of migration
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)) {
        await tx.$executeRawUnsafe(statement);
      }

      const existingAccounts = await tx.$queryRaw<
        Array<{ id: number; mustChangePassword: boolean }>
      >`
        SELECT id, "mustChangePassword" FROM "users" ORDER BY id
      `;
      expect(existingAccounts).toEqual([
        { id: 1, mustChangePassword: true },
        { id: 2, mustChangePassword: true },
      ]);

      await tx.$executeRawUnsafe('INSERT INTO "users" (id) VALUES (3)');
      const newAccount = await tx.$queryRaw<Array<{ mustChangePassword: boolean }>>`
        SELECT "mustChangePassword" FROM "users" WHERE id = 3
      `;
      expect(newAccount).toEqual([{ mustChangePassword: false }]);
    });
  });
});
