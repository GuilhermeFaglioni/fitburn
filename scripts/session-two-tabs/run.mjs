#!/usr/bin/env node
/**
 * Prova em navegador real (Chromium) de que duas abas do mesmo navegador, compartilhando o cookie
 * de refresh, renovam a sessão sem derrubá-la (issue #77).
 *
 *   pnpm session:two-tabs
 *
 * Só toca o banco `fitburn_test_<nº>` apontado por DATABASE_URL_TEST. Ver README.md.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchBrowser } from "../lib/browser.mjs";
import {
  SYNTHETIC,
  connectDatabase,
  createSyntheticUser,
  refreshChain,
  resolveTestDatabase,
  startStack,
} from "./lib/stack.mjs";

const ROUNDS = Number(process.env.SESSION_TWO_TABS_ROUNDS ?? 3);
const CONTROL_ATTEMPTS = Number(process.env.SESSION_TWO_TABS_CONTROL_ATTEMPTS ?? 10);
const TIMEOUT = 20_000;

/**
 * O Playwright 1.56 procura o Chromium da sua revisão; se o cache local tem outra revisão
 * (ex.: a instalada por outra versão do Playwright), usa a mais nova que existir. CHROMIUM_PATH vence.
 */
function useInstalledChromium() {
  if (process.env.CHROMIUM_PATH) return;
  const cache = path.join(
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), "Library/Caches/ms-playwright"),
  );
  if (!fs.existsSync(cache)) return;
  const shells = fs
    .readdirSync(cache)
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort()
    .reverse();
  for (const dir of shells) {
    const base = path.join(cache, dir);
    for (const sub of fs.readdirSync(base)) {
      const executable = path.join(base, sub, "chrome-headless-shell");
      if (fs.existsSync(executable)) {
        process.env.CHROMIUM_PATH = executable;
        return;
      }
    }
  }
}

const log = (...args) => console.log("[duas-abas]", ...args);

const NAV = 'nav[aria-label="Navegação principal"]';
const LOGIN_TITLE = ".login-form__title";
const REFRESH_PATH = "/api/auth/refresh";
const CLIENTS_REQUEST = /\/api\/clients(\?|$)/;

/** Espera a aba assentar: devolve "autenticada" (menu da área protegida) ou "login". */
async function settle(page) {
  const first = page.locator(`${NAV}, ${LOGIN_TITLE}`).first();
  await first.waitFor({ timeout: TIMEOUT });
  return (await page.locator(NAV).count()) > 0 ? "autenticada" : "login";
}

/** Registra as respostas de /api/auth/refresh de todas as abas do contexto. */
function trackRefresh(context) {
  const responses = [];
  context.on("response", (response) => {
    if (new URL(response.url()).pathname === REFRESH_PATH) responses.push(response.status());
  });
  return responses;
}

function check(failures, condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Cadeia de refresh tokens do usuário depois de um cenário legítimo: um sucessor por token
 * consumido (cada 200 consumiu um token e criou um), nenhum token reapresentado (nenhum 401 no
 * refresh) e a sessão continua de pé (um único token ativo).
 */
async function verifyChain(db, userId, refreshStatuses, since, failures, label) {
  const statuses = refreshStatuses.slice(since);
  const ok = statuses.filter((status) => status === 200).length;
  const rejected = statuses.filter((status) => status !== 200);
  const chain = await refreshChain(db, userId);
  check(
    failures,
    ok >= 2,
    `${label}: esperava pelo menos 2 renovações (uma por aba), houve ${ok}.`,
  );
  check(
    failures,
    rejected.length === 0,
    `${label}: refresh recusado/falho (${rejected.join(", ")}).`,
  );
  check(failures, chain.active === 1, `${label}: tokens ativos = ${chain.active}, esperado 1.`);
  check(
    failures,
    chain.revoked === chain.total - 1,
    `${label}: tokens revogados = ${chain.revoked} de ${chain.total}, esperado ${chain.total - 1}.`,
  );
  return { ok, chain };
}

async function resetTokens(db, userId) {
  await db.query('DELETE FROM refresh_tokens WHERE "userId" = $1', [userId]);
}

async function loginViaUi(page, webUrl) {
  await page.goto(`${webUrl}/login`);
  await page.locator(LOGIN_TITLE).waitFor({ timeout: TIMEOUT });
  await page.getByLabel("E-mail").fill(SYNTHETIC.email);
  await page.getByLabel("Senha", { exact: true }).fill(SYNTHETIC.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.locator(NAV).waitFor({ timeout: TIMEOUT });
}

/** Cenários legítimos (com o lock): A, restauração simultânea; B, 401 simultâneo. */
async function legitimateRound(browser, ctx, round) {
  const { db, userId, webUrl } = ctx;
  const failures = [];
  await resetTokens(db, userId);

  const context = await browser.newContext({ serviceWorkers: "block", baseURL: webUrl });
  try {
    const refreshStatuses = trackRefresh(context);
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginViaUi(page1, webUrl);
    await page2.goto("/dashboard");
    check(
      failures,
      (await settle(page2)) === "autenticada",
      `R${round}: aba 2 não restaurou a sessão ao abrir.`,
    );

    // ---- Cenário A: restauração simultânea (as duas abas recarregam ao mesmo tempo).
    let since = refreshStatuses.length;
    await Promise.all([page1.reload(), page2.reload()]);
    const outcomesA = await Promise.all([settle(page1), settle(page2)]);
    outcomesA.forEach((outcome, i) =>
      check(
        failures,
        outcome === "autenticada",
        `R${round} A: aba ${i + 1} terminou em "${outcome}".`,
      ),
    );
    const a = await verifyChain(db, userId, refreshStatuses, since, failures, `R${round} A`);

    // ---- Cenário B: 401 simultâneo (o access token em memória "expira" nas duas abas).
    const expired = [0, 0];
    for (const [i, page] of [page1, page2].entries()) {
      await page.route(CLIENTS_REQUEST, (route) => {
        if (expired[i] === 0) {
          expired[i] += 1;
          return route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              code: "UNAUTHENTICATED",
              message: "Sessão inválida ou expirada.",
            }),
          });
        }
        return route.continue();
      });
    }
    since = refreshStatuses.length;
    const retried = [page1, page2].map((page) =>
      page.waitForResponse((r) => CLIENTS_REQUEST.test(r.url()) && r.status() === 200, {
        timeout: TIMEOUT,
      }),
    );
    await Promise.all(
      [page1, page2].map((page) =>
        page.locator(NAV).getByRole("link", { name: "Clientes" }).click(),
      ),
    );
    await Promise.all(retried).catch(() =>
      failures.push(
        `R${round} B: a requisição repetida depois do 401 não terminou em 200 nas duas abas.`,
      ),
    );
    check(
      failures,
      expired[0] === 1 && expired[1] === 1,
      `R${round} B: o 401 simulado não ocorreu nas duas abas.`,
    );
    for (const [i, page] of [page1, page2].entries()) {
      await page.getByRole("heading", { name: "Clientes", level: 1 }).waitFor({ timeout: TIMEOUT });
      check(
        failures,
        (await settle(page)) === "autenticada",
        `R${round} B: aba ${i + 1} perdeu a sessão.`,
      );
    }
    const b = await verifyChain(db, userId, refreshStatuses, since, failures, `R${round} B`);

    return { failures, a, b };
  } finally {
    await context.close();
  }
}

/**
 * Controle negativo: o cenário A num contexto sem `navigator.locks`. Devolve se a sessão caiu.
 * Cada tentativa usa um contexto novo e login pela API (o cookie fica no jar do contexto).
 */
async function controlAttempt(browser, ctx) {
  const { db, userId, webUrl } = ctx;
  await resetTokens(db, userId);
  const context = await browser.newContext({ serviceWorkers: "block", baseURL: webUrl });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", { value: undefined });
    });
    const refreshStatuses = trackRefresh(context);
    const login = await context.request.post("/api/auth/login", {
      data: { email: SYNTHETIC.email, password: SYNTHETIC.password },
    });
    if (!login.ok()) throw new Error(`login do controle falhou (${login.status()}).`);

    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/dashboard");
    if ((await settle(page1)) !== "autenticada")
      throw new Error("controle: aba 1 não abriu autenticada.");
    await page2.goto("/dashboard");
    if ((await settle(page2)) !== "autenticada")
      throw new Error("controle: aba 2 não abriu autenticada.");

    const since = refreshStatuses.length;
    await Promise.all([page1.reload(), page2.reload()]);
    const outcomes = await Promise.all([settle(page1), settle(page2)]);
    const chain = await refreshChain(db, userId);
    const refused = refreshStatuses.slice(since).filter((status) => status === 401).length;
    return {
      dropped: outcomes.includes("login") || chain.active === 0,
      outcomes,
      refused,
      active: chain.active,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const database = resolveTestDatabase(); // recusa tudo que não for fitburn_test_<nº>
  log(`banco de teste: ${database.name}`);

  let stack;
  let db;
  let synthetic;
  let browser;
  const onSignal = () => {
    stack?.stop();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const failures = [];
  const summary = [];
  try {
    db = await connectDatabase(database);
    stack = await startStack(database, { log });
    synthetic = await createSyntheticUser(db);
    log(`usuário sintético criado (${SYNTHETIC.email})`);
    useInstalledChromium();
    browser = await launchBrowser();
    const ctx = { db, userId: synthetic.userId, webUrl: stack.webUrl };

    for (let round = 1; round <= ROUNDS; round++) {
      const result = await legitimateRound(browser, ctx, round);
      failures.push(...result.failures);
      const status = result.failures.length === 0 ? "ok" : "FALHOU";
      summary.push(
        `rodada ${round}: A (restauração simultânea) e B (401 simultâneo) ${status}` +
          ` | A: ${result.a.ok} renovações, cadeia acumulada ${result.a.chain.total} tokens/${result.a.chain.revoked} revogados/${result.a.chain.active} ativo` +
          ` | B: ${result.b.ok} renovações, cadeia acumulada ${result.b.chain.total}/${result.b.chain.revoked}/${result.b.chain.active}`,
      );
      log(summary.at(-1));
    }

    // Controle negativo (evidência; não entra no código de saída).
    let dropped = 0;
    const attempts = [];
    for (let attempt = 1; attempt <= CONTROL_ATTEMPTS; attempt++) {
      const result = await controlAttempt(browser, ctx);
      if (result.dropped) dropped += 1;
      attempts.push(result);
      log(
        `controle sem lock ${attempt}/${CONTROL_ATTEMPTS}: ${result.dropped ? "SESSÃO CAIU" : "sessão sobreviveu"}` +
          ` (abas: ${result.outcomes.join(" + ")}; refresh 401: ${result.refused}; tokens ativos: ${result.active})`,
      );
    }
    summary.push(
      `controle negativo (sem navigator.locks): sessão caiu em ${dropped} de ${CONTROL_ATTEMPTS} tentativas` +
        (dropped === 0 ? " (não reproduziu a corrida nesta máquina)" : ""),
    );
  } catch (error) {
    failures.push(`erro inesperado: ${error?.stack ?? error}`);
  } finally {
    await browser?.close().catch(() => {});
    if (synthetic) {
      await synthetic
        .cleanup()
        .then(() => log("usuário e perfil sintéticos removidos"))
        .catch((error) => console.error("limpeza do usuário falhou:", error.message));
    }
    await db?.end().catch(() => {});
    stack?.stop();
  }

  console.log("\n=== Resumo ===");
  summary.forEach((line) => console.log(`- ${line}`));
  if (failures.length > 0) {
    console.log("\nFALHAS:");
    failures.forEach((line) => console.log(`- ${line}`));
    process.exit(1);
  }
  console.log("\nOK: A e B passaram em todas as rodadas.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
