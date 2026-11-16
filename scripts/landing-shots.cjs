/* global document, window */
// Prints de página inteira da landing (375 e 1440) com todas as imagens carregadas e o topo legível.
// Uso: node scripts/landing-shots.cjs <baseUrl> <outDir>
const { chromium } = require("playwright-core");
const fs = require("fs");

const base = process.argv[2] || "http://localhost:8080";
const out = process.argv[3] || "shots";
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  let bad = 0;
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    for (const [path, name] of [["/", "home"], ["/creditos", "creditos"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: "load" });
      // Força o carregamento de imagens lazy e rola a página inteira para disparar tudo.
      await page.evaluate(() => document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager")));
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += h / 2) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(120);
      }
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
      const broken = await page.evaluate(() => [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src));
      const count = await page.evaluate(() => document.images.length);
      console.log(`${name} ${w}px: ${count} imagens, ${broken.length} sem carregar`, broken.join(" "));
      if (broken.length) bad = 1;
      // Volta ao topo: o cabeçalho fixo/sticky fica no lugar certo, sobre o início da página.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
      await page.screenshot({ path: `${out}/${name}-${w}-topo.png` });
      await ctx.close();
    }
  }
  await browser.close();
  process.exit(bad);
})();
