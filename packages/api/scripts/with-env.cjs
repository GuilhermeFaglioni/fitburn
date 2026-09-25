#!/usr/bin/env node
// Carrega o .env da raiz do monorepo antes de rodar um comando.
// Uso: node scripts/with-env.js [--test-db] <comando> [args...]
const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const args = process.argv.slice(2);
const useTestDb = args[0] === "--test-db";
const commandArgs = useTestDb ? args.slice(1) : args;

if (useTestDb) {
  if (!process.env.DATABASE_URL_TEST) {
    console.error(
      "DATABASE_URL_TEST não definido. Copie .env.example para .env na raiz do projeto.",
    );
    process.exit(1);
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido. Copie .env.example para .env na raiz do projeto.");
  process.exit(1);
}

const [command, ...rest] = commandArgs;
if (!command) {
  console.error("Uso: node scripts/with-env.js [--test-db] <comando> [args...]");
  process.exit(1);
}

const result = spawnSync(command, rest, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
