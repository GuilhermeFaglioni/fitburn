/* global document */
import fs from "node:fs";
import { chromium } from "playwright-core";

/** Abre o Chromium do Playwright (o ambiente já traz os navegadores em /opt/pw-browsers). */
export async function launchBrowser() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync("/opt/pw-browsers")) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
  }
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath, args: ["--font-render-hinting=none"] });
}

/** Espera o layout assentar: fontes, imagens e um respiro para animações/transições. */
export async function settle(page, ms = 400) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  // A casca do app mantém requisições em segundo plano: não espere a rede "ficar quieta" por muito tempo.
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.waitForTimeout(ms);
}
