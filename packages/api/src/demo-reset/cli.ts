import "reflect-metadata";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { AppConfigError } from "../config/app-config.js";
import {
  DEMO_RESET_FLAG,
  DemoResetRefusedError,
  databaseNameFromUrl,
  runDemoReset,
} from "./demo-reset.js";

/**
 * Comando técnico de reset da demonstração (`pnpm demo:reset`). Roda fora do
 * servidor HTTP e nunca é exposto na interface. Apaga TODOS os dados do banco
 * da DATABASE_URL, aplica as migrations e refaz os seeds.
 *
 * Exige DEMO_RESET_ENABLED=true e a confirmação explícita do nome do banco:
 * `--confirm-database=<nome>` ou, em terminal interativo, digitá-lo quando pedido.
 */

function confirmationFromArgs(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--confirm-database=")) return arg.slice("--confirm-database=".length);
    if (arg === "--confirm-database") return argv[i + 1];
  }
  return undefined;
}

async function promptConfirmation(databaseName: string): Promise<string | undefined> {
  if (!process.stdin.isTTY) return undefined;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(
      `Isto APAGA TODOS OS DADOS do banco "${databaseName}". Digite o nome do banco para confirmar: `,
    );
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const env = process.env;
  // O prompt só faz sentido depois da trava da flag: sem ela, recusa sem perguntar nada.
  const databaseName = databaseNameFromUrl(env.DATABASE_URL);
  let confirmation = confirmationFromArgs(process.argv.slice(2));
  if (confirmation === undefined && databaseName && env[DEMO_RESET_FLAG]?.trim() === "true") {
    confirmation = await promptConfirmation(databaseName);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    console.log(`Reset da demonstração: banco "${databaseName ?? "?"}".`);
    await runDemoReset({ env, confirmation, prisma });
    console.log(`Reset concluído: administrador inicial "${env.INITIAL_ADMIN_EMAIL}" pronto.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Recusas e configuração inválida: mensagem objetiva, sem stack; saída com erro.
  const known = error instanceof DemoResetRefusedError || error instanceof AppConfigError;
  console.error(known ? `Reset RECUSADO: ${error.message}` : error);
  process.exit(1);
});
