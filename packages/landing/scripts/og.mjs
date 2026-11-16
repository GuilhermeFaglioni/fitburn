#!/usr/bin/env node
/* global document */
/**
 * Gera public/og.png (1200x630) e public/apple-touch-icon.png (180x180) a partir de og/og.html.
 *   CHROMIUM_PATH=/caminho/do/chrome-headless-shell pnpm --filter @fitburn/landing og
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error("Defina CHROMIUM_PATH");

const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(new URL("og/og.html", root).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL("public/og.png", root)) });

  const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await icon.setContent(
    `<body style="margin:0;background:#0A0A0A;display:grid;place-items:center;width:180px;height:180px"><img src="${new URL("public/flame.svg", root).href}" width="120" height="120"></body>`,
  );
  await icon.screenshot({ path: fileURLToPath(new URL("public/apple-touch-icon.png", root)) });
} finally {
  await browser.close();
}
