import fs from "node:fs";
import path from "node:path";
import { launchBrowser, settle } from "./browser.mjs";
import { readCanvas, startDesignServer } from "./design-server.mjs";
import { routeGoogleFonts } from "./fonts.mjs";
import { DESIGN_OUT } from "./paths.mjs";

/**
 * Renderiza os artboards do design em PNG (tamanho de canvas.json).
 * `captures` vem de captures.mjs; cada uma pode ter `design.variants`
 * (estado alternativo por props e/ou cliques).
 */
export async function renderDesign(captures, { only } = {}) {
  fs.mkdirSync(DESIGN_OUT, { recursive: true });
  const canvas = readCanvas();
  const server = await startDesignServer();
  const browser = await launchBrowser();
  const results = [];
  try {
    for (const capture of captures) {
      if (only && !only.includes(capture.id)) continue;
      const board = canvas.boards[`${capture.id}.dc.html`];
      if (!board) {
        console.warn(`[design] ${capture.id}: não está no canvas.json`);
        continue;
      }
      const variants = [{ name: "default" }, ...(capture.design?.variants ?? [])];
      for (const variant of variants) {
        const suffix = variant.name === "default" ? "" : `__${variant.name}`;
        const file = path.join(DESIGN_OUT, `${capture.id}${suffix}.png`);
        const context = await browser.newContext({ viewport: { width: board.w, height: board.h } });
        await routeGoogleFonts(context);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          const props = encodeURIComponent(JSON.stringify(variant.props ?? {}));
          await page.goto(`${server.origin}/${capture.id}.dc.html?props=${props}`);
          await page.waitForSelector("x-dc, body > *", { timeout: 15000 });
          await settle(page, 700);
          for (const step of variant.steps ?? []) await runStep(page, step);
          if (variant.steps?.length) await settle(page, 200);
          await page.screenshot({ path: file, clip: { x: 0, y: 0, width: board.w, height: board.h } });
          results.push({ id: capture.id, variant: variant.name, file, ok: true, errors });
          console.log(`[design] ${capture.id}${suffix} ${board.w}x${board.h}`);
        } catch (error) {
          results.push({ id: capture.id, variant: variant.name, ok: false, error: error.message, errors });
          console.warn(`[design] ${capture.id}${suffix} FALHOU: ${error.message.split("\n")[0]}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return results;
}

/** Passos de interação: { click: "texto do botão" } | { clickSelector } | { fill: [selector, valor] }. */
export async function runStep(page, step) {
  if (step.click) await page.getByText(step.click, { exact: true }).first().click();
  else if (step.clickSelector) await page.locator(step.clickSelector).first().click();
  else if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1]);
  else if (step.wait) await page.waitForTimeout(step.wait);
}
