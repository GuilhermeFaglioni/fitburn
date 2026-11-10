#!/usr/bin/env node
/* global document */
/**
 * Gera public/og.png (1200x630) e public/apple-touch-icon.png (180x180) a partir de og/og.html.
 * Os dois arquivos são commitados; rode de novo só quando o molde mudar.
 *
 *   CHROMIUM_PATH=/caminho/do/chrome-headless-shell pnpm --filter @fitburn/landing og
 */
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error("Defina CHROMIUM_PATH com o caminho do Chromium.");

const template = pathToFileURL(fileURLToPath(new URL("../og/og.html", import.meta.url))).href;
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const browser = await chromium.launch({ executablePath });
try {
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.goto(template);
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: out("og.png") });

  const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await icon.goto(template);
  await icon.evaluate(() => document.body.classList.add("icon-mode"));
  await icon.evaluate(() => document.fonts.ready);
  await icon.screenshot({ path: out("apple-touch-icon.png") });
  console.log("og.png e apple-touch-icon.png gerados em public/");
} finally {
  await browser.close();
}
