import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./paths.mjs";

/**
 * Chromium do Playwright não passa pelo proxy do ambiente, então as fontes do
 * Google (Cormorant e DM Sans, usadas pelo design e pelo app) são baixadas com
 * `curl` uma vez, guardadas em tmp/design-compare/fonts e servidas por
 * `page.route`. Sem isso as duas telas cairiam nas fontes do sistema.
 */
const CACHE = path.join(OUT_DIR, "fonts");
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
let warned = false;

function cachePath(url) {
  return path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex"));
}

function download(url) {
  const file = cachePath(url);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(CACHE, { recursive: true });
  const data = execFileSync("curl", ["-sSfL", "--max-time", "30", "-A", UA, url], {
    maxBuffer: 32 * 1024 * 1024,
  });
  fs.writeFileSync(file, data);
  return file;
}

/** Instala a interceptação das fontes do Google num BrowserContext. */
export async function routeGoogleFonts(context) {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const url = route.request().url();
    try {
      const file = download(url);
      const isCss = url.includes("fonts.googleapis.com");
      await route.fulfill({
        status: 200,
        body: fs.readFileSync(file),
        headers: {
          "content-type": isCss ? "text/css; charset=utf-8" : "font/woff2",
          "access-control-allow-origin": "*",
        },
      });
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn(`[fonts] não foi possível baixar as fontes (${error.message}); usando as do sistema.`);
      }
      await route.abort();
    }
  });
}

/** Espera as web fonts da página terminarem de carregar. */
export async function fontsReady(page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}
