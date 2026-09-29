import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { loadAppConfig } from "../config/app-config.js";
import { seedBaseData } from "../seed/base-seed.js";

/** Flag de ambiente que habilita o reset. Só o valor exato "true" vale. */
export const DEMO_RESET_FLAG = "DEMO_RESET_ENABLED";

/** O reset foi recusado por uma trava de segurança; nenhum dado foi apagado. */
export class DemoResetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoResetRefusedError";
  }
}

export interface DemoResetOptions {
  env: NodeJS.ProcessEnv;
  /** Nome do banco digitado (ou passado em --confirm-database) pelo operador. */
  confirmation: string | undefined;
  prisma: PrismaClient;
  /** Aplica as migrations pendentes. Injetável nos testes; o padrão roda `prisma migrate deploy`. */
  migrate?: (env: NodeJS.ProcessEnv) => Promise<void>;
}

/** Nome do banco da URL de conexão (sem senha, host ou parâmetros), ou undefined se inválida. */
export function databaseNameFromUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Todas as travas que valem ANTES de qualquer escrita. Devolve o nome do
 * banco que será apagado. Nunca inclui valores de segredos nas mensagens.
 */
function assertResetAllowed(options: DemoResetOptions): string {
  const { env, confirmation } = options;

  if (env[DEMO_RESET_FLAG]?.trim() !== "true") {
    throw new DemoResetRefusedError(
      `${DEMO_RESET_FLAG}=true é obrigatório: o reset da demonstração apaga todos os dados.`,
    );
  }

  // Mesma validação da inicialização da API: em produção (qualquer NODE_ENV que não seja
  // development/test) recusa segredos ausentes ou de exemplo, lançando AppConfigError.
  loadAppConfig(env);

  const missingAdmin = [
    "INITIAL_ADMIN_EMAIL",
    "INITIAL_ADMIN_PASSWORD",
    "INITIAL_ADMIN_NAME",
  ].filter((name) => !env[name]?.trim());
  if (missingAdmin.length > 0) {
    throw new DemoResetRefusedError(
      `${missingAdmin.join(", ")} é obrigatório para recriar o administrador inicial.`,
    );
  }

  const databaseName = databaseNameFromUrl(env.DATABASE_URL);
  if (!databaseName) {
    throw new DemoResetRefusedError("DATABASE_URL ausente ou inválida.");
  }

  if (!confirmation?.trim()) {
    throw new DemoResetRefusedError(
      `Confirmação explícita ausente: informe --confirm-database=${databaseName} ` +
        "(ou digite o nome do banco quando solicitado).",
    );
  }
  if (confirmation.trim() !== databaseName) {
    throw new DemoResetRefusedError(
      `A confirmação não bate com o banco da DATABASE_URL ("${databaseName}"). Nada foi apagado.`,
    );
  }

  return databaseName;
}

export async function runDemoReset(options: DemoResetOptions): Promise<void> {
  const databaseName = assertResetAllowed(options);

  // Última barreira: o banco realmente conectado tem de ser o confirmado.
  const [connected] = await options.prisma.$queryRaw<Array<{ db: string }>>`
    SELECT current_database() AS db
  `;
  if (connected?.db !== databaseName) {
    throw new DemoResetRefusedError(
      `O cliente está conectado ao banco "${connected?.db}", diferente do confirmado ("${databaseName}"). Nada foi apagado.`,
    );
  }

  await (options.migrate ?? migrateDeploy)(options.env);

  // Limpeza e seed na mesma transação: se o seed falhar, os dados anteriores permanecem.
  await options.prisma.$transaction(
    async (tx) => {
      const tables = await tx.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
      `;
      if (tables.length > 0) {
        const names = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
      }
      await seedBaseData(tx, options.env);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

/** Raiz do pacote da API (funciona a partir de src/ e de dist/). */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** `prisma migrate deploy` contra a DATABASE_URL do ambiente (só aplica migrations pendentes). */
function migrateDeploy(env: NodeJS.ProcessEnv): Promise<void> {
  const bin = path.join(PACKAGE_ROOT, "node_modules", ".bin", "prisma");
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["migrate", "deploy"], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`prisma migrate deploy falhou (código ${code}).`)),
    );
  });
}
