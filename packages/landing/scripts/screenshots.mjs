#!/usr/bin/env node
/* global document */
/**
 * Screenshots da página inteira (375 e 1440px) e checagem de rolagem horizontal em 320, 375, 768, 1024,
 * 1280 e 1440px. Precisa da landing de pé (`pnpm --filter @fitburn/landing preview`, porta 4321).
 *
 *   CHROMIUM_PATH=/caminho/do/chrome-headless-shell OUT_DIR=/tmp/landing node packages/landing/scripts/screenshots.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const URL_BASE = process.env.LANDING_URL ?? "http://localhost:4321";
const OUT_DIR = process.env.OUT_DIR ?? "tmp/landing";
const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error("Defina CHROMIUM_PATH com o caminho do Chromium.");
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath });
let failed = false;
try {
  for (const width of [320, 375, 768, 1024, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(URL_BASE, { waitUntil: "networkidle" });
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    const ok = scroll <= client;
    failed ||= !ok;
    console.log(`${ok ? "ok  " : "FALHA"} ${width}px: scrollWidth ${scroll}, clientWidth ${client}`);
    if (width === 375 || width === 1440) {
      await page.screenshot({ path: join(OUT_DIR, `landing-${width}.png`), fullPage: true });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
