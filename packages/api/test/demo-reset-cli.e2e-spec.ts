import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const TSX = path.join(PACKAGE_ROOT, "node_modules", ".bin", "tsx");
const CLI = path.join(PACKAGE_ROOT, "src", "demo-reset", "cli.ts");

const ADMIN_EMAIL = "admin.cli@fitburn.test";

/** Roda o script como o operador roda (`pnpm demo:reset`): processo próprio, fora do servidor HTTP. */
function runCli(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DEMO_RESET_ENABLED: "true",
    INITIAL_ADMIN_EMAIL: ADMIN_EMAIL,
    INITIAL_ADMIN_PASSWORD: "Senha-Demo-Forte-123!",
    INITIAL_ADMIN_NAME: "Administrador CLI",
    ...envOverrides,
  };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(TSX, [CLI, ...args], {
    cwd: PACKAGE_ROOT,
    env,
    encoding: "utf8",
    input: "", // stdin não interativo: nada de prompt
    timeout: 120_000,
  });
}

function databaseName(): string {
  return new URL(process.env.DATABASE_URL as string).pathname.slice(1);
}

describe("Reset da demonstração: comando (processo separado)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    const profile = await createAccessProfile({ name: "Perfil antigo" });
    await createUser({
      email: "sentinela@fitburn.test",
      password: "SenhaForte123!",
      profileId: profile.id,
    });
  });

  const sentinelSurvived = async () =>
    (await testPrisma.user.count({ where: { email: "sentinela@fitburn.test" } })) === 1;

  it("recusa sem a flag de ambiente de demonstração, com código de saída de erro", async () => {
    const result = runCli([`--confirm-database=${databaseName()}`], {
      DEMO_RESET_ENABLED: undefined,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DEMO_RESET_ENABLED");
    expect(await sentinelSurvived()).toBe(true);
  });

  it("recusa sem confirmação explícita quando não há terminal interativo", async () => {
    const result = runCli([]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/confirm/i);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("recusa quando a confirmação não bate com o banco da DATABASE_URL", async () => {
    const result = runCli(["--confirm-database=fitburn_prod"]);

    expect(result.status).not.toBe(0);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("com a flag e a confirmação certa, roda migrations, limpa e semeia; rodar de novo dá no mesmo", async () => {
    const first = runCli([`--confirm-database=${databaseName()}`]);
    expect(first.status).toBe(0);
    expect(await sentinelSurvived()).toBe(false);
    expect((await testPrisma.user.findMany()).map((u) => u.email)).toEqual([ADMIN_EMAIL]);
    expect(
      (await testPrisma.accessProfile.findMany({ orderBy: { name: "asc" } })).map((p) => p.name),
    ).toEqual(["Administrador", "Cliente"]);
    expect(await testPrisma.gamificationRule.count()).toBe(5);

    const second = runCli([`--confirm-database=${databaseName()}`]);
    expect(second.status).toBe(0);
    expect((await testPrisma.user.findMany()).map((u) => u.email)).toEqual([ADMIN_EMAIL]);
    expect(await testPrisma.accessProfile.count()).toBe(2);
    expect(await testPrisma.gamificationRule.count()).toBe(5);
  }, 120_000);

  it("aceita a confirmação em duas palavras (--confirm-database <nome>)", async () => {
    const result = runCli(["--confirm-database", databaseName()]);

    expect(result.status).toBe(0);
    expect(await sentinelSurvived()).toBe(false);
  }, 120_000);
});
