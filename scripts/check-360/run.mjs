#!/usr/bin/env node
/* global document */
/**
 * Verificação de responsividade em 360px (DS8, issue #144): nas telas do cliente (Login, Home e Agenda),
 * `document.documentElement.scrollWidth <= clientWidth`, ou seja, sem scroll horizontal da página.
 *
 * Precisa da API (http://localhost:3333/api) e do web (http://localhost:5173) de pé, e do seed de demonstração
 * (`pnpm design:seed`) no banco de teste da issue. Não roda na CI (o projeto não tem navegador automatizado).
 *
 *   CHROMIUM_PATH=/caminho/do/chrome-headless-shell pnpm check:360
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:3333/api";
const WIDTH = 360;
const HEIGHT = 780;

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const password = env.match(/^INITIAL_ADMIN_PASSWORD="?([^"\n]+)"?/m)?.[1];
if (!password) throw new Error("INITIAL_ADMIN_PASSWORD não encontrado no .env");

async function apiLogin(email, secret) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: secret }),
  });
  return (await res.json()).accessToken ?? null;
}

/**
 * Prepara a conta para a checagem: troca a senha de demonstração por uma temporária quando a conta exige
 * troca no primeiro acesso, aceita o onboarding e devolve a senha em uso e a função que restaura a original.
 */
async function prepareAccount(email) {
  let token = await apiLogin(email, password);
  if (!token) throw new Error(`login de ${email} falhou (rode o seed: pnpm design:seed)`);
  let inUse = password;
  const temp = `Verifica360-${Date.now()}`;
  const change = await fetch(`${API}/auth/password`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword: password, newPassword: temp }),
  });
  if (change.ok) {
    inUse = temp;
    token = await apiLogin(email, temp);
  }
  for (const step of ["privacy-acknowledgement", "terms-acceptance"]) {
    await fetch(`${API}/onboarding/${step}`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  }
  const restore = async () => {
    if (inUse === password) return;
    const current = await apiLogin(email, inUse);
    await fetch(`${API}/auth/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${current}` },
      body: JSON.stringify({ currentPassword: inUse, newPassword: password }),
    });
  };
  return { inUse, restore };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();

async function signIn(email, secret) {
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill(secret);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

async function overflowOf(path) {
  await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "attached", timeout: 15000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

const results = [];
results.push({ tela: "Login", path: "/login", ...(await overflowOf("/login")) });
const CLIENT = "marina.souza@email.com";
const account = await prepareAccount(CLIENT);
await signIn(CLIENT, account.inUse);
results.push({ tela: "Home", path: "/", ...(await overflowOf("/")) });
results.push({ tela: "Agenda", path: "/agenda", ...(await overflowOf("/agenda")) });
await browser.close();
await account.restore();

let failed = false;
for (const r of results) {
  const ok = r.scrollWidth <= r.clientWidth;
  failed ||= !ok;
  console.log(`${ok ? "OK  " : "FALHA"} ${r.tela.padEnd(8)} ${r.path.padEnd(10)} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}`);
}
process.exit(failed ? 1 : 0);
