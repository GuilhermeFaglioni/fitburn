/* global document, window */
// Responsividade (320, 768, 1024, 1280) e validação estrutural do JSON-LD (schema.org).
// Uso: node scripts/landing-responsive.cjs <baseUrl> <outDir>
const { chromium } = require("playwright-core");
const fs = require("fs");

const base = process.argv[2] || "http://localhost:8080";
const out = process.argv[3] || "responsive";
fs.mkdirSync(out, { recursive: true });
const report = [];
let bad = 0;
const log = (m) => {
  console.log(m);
  report.push(m);
};
const need = (cond, m) => {
  if (!cond) {
    bad = 1;
    log("  FALHA: " + m);
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
  for (const w of [320, 768, 1024, 1280]) {
    for (const [path, name] of [["/", "home"], ["/creditos", "creditos"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: "load" });
      await page.evaluate(() => document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager")));
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 400) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(80);
      }
      await page
        .waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 })
        .catch(() => {});
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        broken: [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).length,
        imgs: document.images.length,
        h1: document.querySelectorAll("h1").length,
      }));
      log(`${name} ${w}px: scrollWidth=${r.sw} clientWidth=${r.cw} imagens=${r.imgs} sem_carregar=${r.broken} h1=${r.h1}`);
      need(r.sw <= r.cw, `rolagem horizontal em ${name} ${w}px`);
      need(r.broken === 0, `imagem quebrada em ${name} ${w}px`);
      need(r.h1 === 1, `h1 != 1 em ${name} ${w}px`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
      await ctx.close();
    }
  }
  // JSON-LD: parse + checagem estrutural contra schema.org (o validador web externo não tem API pública).
  const page = await browser.newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  const blocks = await page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
  );
  log(`JSON-LD: ${blocks.length} blocos`);
  need(blocks.length >= 1, "sem JSON-LD");
  const types = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (o["@type"]) types.push(o["@type"]);
      Object.values(o).forEach(walk);
    }
  };
  for (const b of blocks) {
    let j;
    try {
      j = JSON.parse(b);
    } catch (e) {
      need(false, "JSON-LD inválido: " + e.message);
      continue;
    }
    need(String(j["@context"]).includes("schema.org"), "@context != schema.org");
    walk(j);
    if (j["@type"] === "FAQPage") {
      need(Array.isArray(j.mainEntity) && j.mainEntity.length > 0, "FAQPage sem mainEntity");
      for (const q of j.mainEntity || []) {
        need(q["@type"] === "Question" && q.name && q.acceptedAnswer && q.acceptedAnswer.text, "Question sem name/acceptedAnswer.text");
      }
    }
    if (/Gym|LocalBusiness/.test(String(j["@type"]))) {
      for (const k of ["name", "address", "url"]) need(j[k], `${j["@type"]} sem ${k}`);
      need(j.address && j.address["@type"] === "PostalAddress", "address não é PostalAddress");
    }
  }
  log("tipos: " + [...new Set(types)].join(", "));
  fs.writeFileSync(`${out}/resultado.txt`, report.join("\n") + "\n");
  await browser.close();
  process.exit(bad);
})();
