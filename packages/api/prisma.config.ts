import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// process.env.DATABASE_URL já vem populado por scripts/with-env.cjs (que lê
// o .env da raiz do monorepo) antes de invocar o CLI do Prisma; o
// "dotenv/config" acima é só a rede de segurança recomendada pela doc do
// Prisma 7 para quem chama o CLI diretamente.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
