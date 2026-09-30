import fs from "node:fs";
import path from "node:path";
import { launchBrowser, settle } from "./browser.mjs";
import { readCanvas } from "./design-server.mjs";
import { ACCOUNTS, apiFor } from "./accounts.mjs";
import { routeGoogleFonts } from "./fonts.mjs";
import { APP_OUT } from "./paths.mjs";

const WEB = process.env.WEB_URL ?? "http://localhost:5173";

/**
 * Captura no app a tela equivalente a cada artboard, no mesmo viewport
 * (largura e altura do canvas.json), fazendo login por perfil.
 */
export async function captureApp(captures, { only } = {}) {
  fs.mkdirSync(APP_OUT, { recursive: true });
  // Só precisamos do canvas.json para saber o tamanho de cada artboard.
  const canvas = readCanvas();
  const browser = await launchBrowser();
  const contexts = new Map(); // perfil -> BrowserContext
  const apis = {};
  const results = [];

  // Um contexto (sessão) por perfil; o viewport muda por página. O refresh token
  // é rotativo, então reaproveitar a mesma sessão é mais seguro que copiá-la.
  async function contextFor(role) {
    if (contexts.has(role)) return contexts.get(role);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await routeGoogleFonts(context);
    if (role !== "none") {
      const page = await context.newPage();
      await page.goto(`${WEB}/login`);
      await page.getByLabel("E-mail").fill(ACCOUNTS[role].email);
      await page.locator('input[type="password"]').fill(ACCOUNTS[role].password);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
      // Deixa a casca terminar as primeiras requisições antes de fechar a aba: o refresh
      // token é rotativo, e recarregar no meio delas derrubaria a sessão.
      await settle(page, 800);
      await page.close();
    }
    contexts.set(role, context);
    return context;
  }

  try {
    for (const capture of captures) {
      if (only && !only.includes(capture.id)) continue;
      if (!capture.app) continue;
      const board = canvas.boards[`${capture.id}.dc.html`];
      const { app } = capture;
      const file = path.join(APP_OUT, `${capture.id}.png`);
      try {
        const context = await contextFor(app.role);
        const page = await context.newPage();
        await page.setViewportSize({ width: board.w, height: board.h });
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        let route = app.route;
        if (app.resolve) {
          apis[app.role] ??= await apiFor(app.role);
          route = await RESOLVERS[app.resolve](apis[app.role], apis);
        }
        await page.goto(`${WEB}${route}`);
        await settle(page, 900);
        let stepError;
        try {
          for (const step of app.steps ?? []) await runAppStep(page, step);
        } catch (error) {
          // Segue com a captura do estado em que ficou: o relatório registra o passo que falhou.
          stepError = error.message.split("\n")[0];
          console.warn(`[app] ${capture.id}: passo falhou (${stepError})`);
        }
        if (app.steps?.length) await settle(page, 300);
        const full = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: board.w, height: board.h } });
        results.push({ id: capture.id, ok: true, file, route, fullHeight: full.height, fullWidth: full.width, errors, stepError });
        console.log(`[app] ${capture.id} ${route} (${board.w}x${board.h}, página ${full.width}x${full.height})`);
        await page.close();
      } catch (error) {
        results.push({ id: capture.id, ok: false, error: error.message });
        console.warn(`[app] ${capture.id} FALHOU: ${error.message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser.close();
  }
  // Mescla com execuções anteriores (uma rodada com --only não apaga as outras telas).
  const metaFile = path.join(APP_OUT, "_captures.json");
  const previous = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : [];
  const merged = [...previous.filter((p) => !results.some((r) => r.id === p.id)), ...results];
  fs.writeFileSync(metaFile, JSON.stringify(merged, null, 2));
  return results;
}

async function runAppStep(page, step) {
  if (step.click) {
    await page.getByRole("button", { name: step.click }).or(page.getByText(step.click, { exact: true })).first().click();
  } else if (step.openClass) {
    const card = page
      .locator(".fb-client-cell--today .fb-client-chip:visible, .fb-class-card:visible")
      .filter({ hasText: step.openClass })
      .first();
    await card.click();
  } else if (step.clickSelector) {
    await page.locator(step.clickSelector).first().click();
  } else if (step.wait) {
    await page.waitForTimeout(step.wait);
  }
}

/** Rotas que dependem de ids criados pelo seed. */
const RESOLVERS = {
  async presenca(api) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const list = await api(`/attendance/classes?from=${day}&to=${day}`);
    const pick =
      list.find((c) => c.name === "Treino Funcional" && c.totalCount > 1 && isToday(c.startsAt)) ??
      list.find((c) => c.totalCount > 1) ??
      list[0];
    if (!pick) throw new Error("nenhuma aula em /attendance/classes (rode o seed)");
    return `/presenca/${pick.id}`;
  },
  async ficha(api) {
    const sheets = await api("/workout-sheets/mine");
    const list = Array.isArray(sheets) ? sheets : (sheets.sheets ?? []);
    const active = list.find((s) => s.status === "ACTIVE") ?? list[0];
    if (!active) throw new Error("cliente sem fichas (rode o seed)");
    return `/ficha-treino/${active.id}`;
  },
};

function isToday(iso) {
  const fmt = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return fmt(new Date(iso)) === fmt(new Date());
}
