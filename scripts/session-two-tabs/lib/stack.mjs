import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, loadEnv } from "../../design-compare/lib/env.mjs";

const API_DIR = path.join(ROOT, "packages/api");
const WEB_DIR = path.join(ROOT, "packages/web");
const requireFromApi = createRequire(path.join(API_DIR, "package.json"));

/** Só bancos descartáveis desta família de issues (fitburn_test_77, fitburn_test_123...). */
const TEST_DB_NAME = /^fitburn_test_\d+$/;

/**
 * Guarda de segurança: lê DATABASE_URL_TEST e recusa tudo que não for `fitburn_test_<nº>`.
 * Nunca olha DATABASE_URL (dev/demonstração).
 */
export function resolveTestDatabase(env = loadEnv()) {
  const raw = env.DATABASE_URL_TEST;
  if (!raw) throw new Error("DATABASE_URL_TEST ausente no .env da raiz.");
  let name;
  try {
    name = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL_TEST não é uma URL válida.");
  }
  if (!TEST_DB_NAME.test(name)) {
    throw new Error(
      `Recusado: o banco de DATABASE_URL_TEST é "${name}". ` +
        "Este script só roda contra bancos fitburn_test_<nº> (ex.: fitburn_test_77).",
    );
  }
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return { name, url: raw, pgUrl: url.toString() };
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, label, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} encerrou antes de ficar pronto.`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} não ficou pronto em ${timeoutMs / 1000}s: ${lastError?.message}`);
}

function runOrThrow(label, command, args, options) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${label} falhou (código ${result.status}).`);
}

/** Processo filho em grupo próprio, para encerrar também netos. */
function spawnGroup(command, args, options) {
  return spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...options });
}

function killGroup(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // já saiu
  }
}

/**
 * Sobe a API (NestJS compilado) contra o banco de teste e o web (build de produção servido
 * por `vite preview`, com proxy /api para a API). Devolve as URLs e `stop()`.
 *
 * O web é o build de produção de propósito: o `vite dev` roda o React em StrictMode, que
 * dispara a restauração da sessão duas vezes por aba e mascararia o cenário de duas abas.
 */
export async function startStack(database, { log = () => {} } = {}) {
  const env = loadEnv();
  const apiPort = await freePort();
  const webPort = await freePort();
  const children = [];

  const stop = () => children.forEach(killGroup);

  try {
    log("compilando a API (tsc)...");
    runOrThrow(
      "build da API",
      process.execPath,
      [path.join(API_DIR, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"],
      { cwd: API_DIR },
    );

    const apiEnv = {
      ...process.env,
      ...env,
      // O banco é sempre o de teste: sobrescreve DATABASE_URL (que pode apontar para dev) antes de a API subir.
      DATABASE_URL: database.url,
      NODE_ENV: "development",
      PORT: String(apiPort),
      // Usuário sintético sem manifestações legais: sem isso o app o mandaria para o onboarding.
      PRIVACY_POLICY_REQUIRES_NEW_MANIFESTATION: "false",
      TERMS_OF_USE_REQUIRES_NEW_MANIFESTATION: "false",
    };
    const api = spawnGroup(process.execPath, ["--enable-source-maps", "dist/main.js"], {
      cwd: API_DIR,
      env: apiEnv,
    });
    children.push(api);
    let apiOutput = "";
    api.stdout.on("data", (chunk) => (apiOutput += chunk));
    api.stderr.on("data", (chunk) => (apiOutput += chunk));
    log(`subindo a API na porta ${apiPort}...`);
    try {
      await waitFor(`http://127.0.0.1:${apiPort}/api/health/live`, "API", api, 60_000);
    } catch (error) {
      throw new Error(`${error.message}\n${apiOutput.slice(-2000)}`, { cause: error });
    }

    // Config derivada do vite.config.ts real: só troca o destino do proxy e a saída do build.
    const cacheDir = path.join(WEB_DIR, "node_modules/.cache/session-two-tabs");
    fs.mkdirSync(cacheDir, { recursive: true });
    const configFile = path.join(cacheDir, "vite.config.mjs");
    fs.writeFileSync(
      configFile,
      [
        'import { mergeConfig } from "vite";',
        'import base from "../../../vite.config.ts";',
        "const proxy = { '/api': { target: process.env.SESSION_TWO_TABS_API, changeOrigin: true } };",
        "export default mergeConfig(base, {",
        "  build: { outDir: new URL('./dist', import.meta.url).pathname, emptyOutDir: true },",
        "  server: { proxy },",
        "  preview: { proxy },",
        "});",
        "",
      ].join("\n"),
    );
    const vite = path.join(WEB_DIR, "node_modules/vite/bin/vite.js");
    const webEnv = {
      ...process.env,
      SESSION_TWO_TABS_API: `http://127.0.0.1:${apiPort}`,
    };
    log("gerando o build do web...");
    runOrThrow(
      "build do web",
      process.execPath,
      [vite, "build", "--config", configFile, "--logLevel", "error"],
      {
        cwd: WEB_DIR,
        env: webEnv,
      },
    );
    const web = spawnGroup(
      process.execPath,
      [
        vite,
        "preview",
        "--config",
        configFile,
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      { cwd: WEB_DIR, env: webEnv },
    );
    children.push(web);
    log(`servindo o web na porta ${webPort}...`);
    await waitFor(`http://127.0.0.1:${webPort}/`, "web", web, 30_000);

    return { apiUrl: `http://127.0.0.1:${apiPort}`, webUrl: `http://127.0.0.1:${webPort}`, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

// ---------------------------------------------------------------- banco de teste

/** Cliente `pg` do pacote da API (o script da raiz não tem `pg` como dependência própria). */
export async function connectDatabase(database) {
  const { Client } = requireFromApi("pg");
  const client = new Client({ connectionString: database.pgUrl });
  await client.connect();
  return client;
}

const SUFFIX = randomUUID().slice(0, 8);
export const SYNTHETIC = {
  email: `sessao-duas-abas-${SUFFIX}@fitburn.local`,
  password: `Senha-${randomUUID()}`,
  fullName: "Pessoa Sintética Duas Abas",
  profileName: `Sessão duas abas ${SUFFIX}`,
};

/**
 * Cria um perfil de equipe mínimo e um usuário ATIVO sintético (e-mail @fitburn.local) sem
 * onboarding pendente (a API deste script sobe com as manifestações legais não exigidas; ver
 * `startStack`), para cair direto no Dashboard. Não grava manifestações porque elas são imutáveis
 * no banco (trigger append-only) e impediriam apagar o usuário. Devolve `cleanup()`, que apaga só
 * o que foi criado aqui (o usuário leva os refresh tokens junto, por cascata).
 */
export async function createSyntheticUser(db) {
  const argon2 = requireFromApi("argon2");
  const passwordHash = await argon2.hash(SYNTHETIC.password, { type: argon2.argon2id });
  const profileId = randomUUID();
  const userId = randomUUID();

  await db.query(
    'INSERT INTO access_profiles (id, name, "isSystem", "isActive", "updatedAt") VALUES ($1, $2, false, true, now())',
    [profileId, SYNTHETIC.profileName],
  );
  for (const [module, actions] of [
    ["DASHBOARD", ["VIEW"]],
    ["CLIENTES", ["VIEW"]],
  ]) {
    await db.query(
      'INSERT INTO profile_module_access (id, module, actions, scope, "profileId") VALUES ($1, $2::"Module", $3::"PermissionAction"[], \'ALL\'::"PermissionScope", $4)',
      [randomUUID(), module, actions, profileId],
    );
  }
  await db.query(
    'INSERT INTO users (id, email, "passwordHash", "fullName", status, "mustChangePassword", "profileId", "updatedAt") VALUES ($1, $2, $3, $4, \'ACTIVE\'::"UserStatus", false, $5, now())',
    [userId, SYNTHETIC.email, passwordHash, SYNTHETIC.fullName, profileId],
  );
  return {
    userId,
    async cleanup() {
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
      await db.query("DELETE FROM access_profiles WHERE id = $1", [profileId]);
    },
  };
}

/** Estado dos refresh tokens do usuário (só contagens; nunca o hash). */
export async function refreshChain(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE "revokedAt" IS NOT NULL)::int AS revoked,
            count(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" > now())::int AS active
       FROM refresh_tokens WHERE "userId" = $1`,
    [userId],
  );
  return rows[0];
}
