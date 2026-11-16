// Auditoria da landing: inventário de CTAs/links (HTML estático) + teste real em Chromium com JS desabilitado.
const http = require("http"), fs = require("fs"), path = require("path");
const W = "/home/agentes/agentes/faglionidev/dev-0407cf65/repos/GuilhermeFaglioni/fitburn-landing";
const dist = path.join(W, "packages/landing/dist");
const out = "/home/agentes/agentes/faglionidev/dev-0407cf65/screenshots/179-audit";
fs.mkdirSync(out, { recursive: true });
const { chromium } = require(path.join(W, "node_modules/playwright-core"));
const { parse } = require(path.join(W, "packages/landing/node_modules/node-html-parser"));
const types = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain", ".avif": "image/avif", ".webp": "image/webp", ".xml": "application/xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  if (p.endsWith("/")) p = p.slice(0, -1);
  let f = path.join(dist, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f += ".html";
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
(async () => {
  await new Promise((r) => server.listen(4398, r));
  for (const pg of ["index.html", "creditos.html"]) {
    const root = parse(fs.readFileSync(path.join(dist, pg), "utf8"));
    log(`\n## Inventário ${pg}`);
    log("| # | seção | texto | href | mensagem (decodificada) | destino |");
    log("|---|---|---|---|---|---|");
    root.querySelectorAll("a").forEach((a, i) => {
      const href = a.getAttribute("href") || "";
      const txt = a.text.replace(/\s+/g, " ").trim() || a.getAttribute("aria-label") || "(sem texto)";
      let sec = "-"; let n = a.parentNode;
      while (n) { const id = n.getAttribute && (n.getAttribute("id") || (n.rawTagName && ["header", "footer"].includes(n.rawTagName) ? n.rawTagName : "")); if (id) { sec = id; break; } n = n.parentNode; }
      let msg = "";
      try { const u = new URL(href); if (u.searchParams.get("text")) msg = u.searchParams.get("text"); } catch { /* href sem URL válida: mantém msg */ }
      const dest = href.startsWith("#") ? "âncora interna" : href.startsWith("tel:") ? "telefone" : href.startsWith("mailto:") ? "e-mail" : href.startsWith("/") ? "página interna" : new URL(href).host;
      log(`| ${i + 1} | ${sec} | ${txt} | ${href} | ${msg} | ${dest}${a.getAttribute("target") ? " (target=" + a.getAttribute("target") + ", rel=" + a.getAttribute("rel") + ")" : ""} |`);
    });
    const scripts = root.querySelectorAll("script").map((s) => s.getAttribute("type") || (s.getAttribute("src") ? "src" : "inline"));
    log(`scripts: ${JSON.stringify(scripts)}`);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  const jsOn = async () => { try { return await page.evaluate(() => 1); } catch (e) { return "bloqueado: " + String(e.message).slice(0, 60); } };
  await page.goto("http://localhost:4398/", { waitUntil: "load" });
  log(`\n## JS desabilitado (375px)`);
  log(`page.evaluate com JS off: ${await jsOn()}`);
  log(`<noscript> presente: ${await page.locator("noscript").count()}`);
  const links = await page.$$eval("a[href]", (as) => as.map((a) => ({ t: (a.textContent || "").trim().replace(/\s+/g, " "), h: a.getAttribute("href"), vis: !!(a.offsetWidth || a.offsetHeight) })));
  log(`links no DOM renderizado: ${links.length}; visíveis: ${links.filter((l) => l.vis).length}`);
  // FAQ: details abre sem JS?
  const det = await page.$$eval("details", (d) => d.length);
  log(`FAQ <details>: ${det}`);
  if (det) {
    const d = page.locator("details").first();
    await d.locator("summary").click();
    log(`primeiro <details> abre ao clicar sem JS: ${await d.evaluate((e) => e.open)}`);
  }
  // âncoras internas navegam sem JS
  const anchors = [...new Set(links.map((l) => l.h).filter((h) => h.startsWith("#") && h.length > 1))];
  for (const h of anchors) {
    const ok = await page.evaluate ? await page.locator(h).count() : 0;
    log(`âncora ${h}: alvo existe = ${ok > 0}`);
  }
  // clique real em cada link externo visível (por índice); captura navegação do frame principal / popup
  const hits = [];
  await ctx.route("**/*", (r) => { const rq = r.request(); const u = rq.url(); if (rq.isNavigationRequest() && !u.startsWith("http://localhost:4398") && (()=>{try{return rq.frame().parentFrame()===null}catch{return true}})()) { hits.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }); } if (!u.startsWith("http://localhost:4398") && !u.startsWith("data:")) return r.abort(); return r.continue(); });
  const total = await page.locator("a[href]").count();
  log("clique real por índice (viewport 375, JS off):");
  for (let i = 0; i < total; i++) {
    const pg = await ctx.newPage();
    await pg.goto("http://localhost:4398/", { waitUntil: "load" });
    const loc = pg.locator("a[href]").nth(i);
    const h = await loc.getAttribute("href");
    if (!/^https?:/.test(h)) { await pg.close(); continue; }
    if (!(await loc.isVisible())) { await pg.close(); log(`- #${i + 1} ${h.slice(0, 40)}… oculto em 375px (não clicável nesta largura)`); continue; }
    const t = (await loc.innerText()).replace(/\s+/g, " ").trim() || (await loc.getAttribute("aria-label"));
    hits.length = 0;
    const popup = ctx.waitForEvent("page", { timeout: 2500, predicate: (p) => p !== pg }).catch(() => null);
    await loc.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await loc.click({ timeout: 5000, noWaitAfter: true }).catch((e) => log("  erro clique: " + e.message.slice(0, 200)));
    const np = await popup; if (np) await np.waitForTimeout(300).catch(() => {});
    if (np) await np.close().catch(() => {});
    await pg.waitForTimeout(150);
    await pg.close();
    const d = hits[0] || "(nenhuma)";
    log(`- #${i + 1} "${t}" → ${d === h ? "✔ destino == href" : "✘ " + d}${np ? " [nova aba]" : ""}`);
  }
  log("tel: " + (await page.locator('a[href^="tel:"]').evaluateAll((e) => e.map((x) => x.getAttribute("href"))).then((x) => [...new Set(x)].join(", "))));
  await page.screenshot({ path: `${out}/nojs-375-topo.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${out}/nojs-1440-topo.png` });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.screenshot({ path: `${out}/nojs-375-full.png`, fullPage: true });
  await page.locator("#contato").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/nojs-375-contato.png` });
  const hs = await page.evaluate ? 0 : 0;
  await browser.close(); server.close();
  fs.writeFileSync(`${out}/resultado.md`, lines.join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
