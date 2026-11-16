// Resume os relatórios JSON do Lighthouse e falha se alguma categoria ficar abaixo de 90
// ou se a página não for rastreável (is-crawlable).
const fs = require("fs");
const dir = process.argv[2] || "lh";
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  const c = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  const a = r.audits;
  console.log(
    f, JSON.stringify(c),
    "LCP", a["largest-contentful-paint"].displayValue,
    "CLS", a["cumulative-layout-shift"].displayValue,
    "TBT", a["total-blocking-time"].displayValue,
    "crawlable", a["is-crawlable"].score,
  );
  for (const [k, v] of Object.entries(a)) {
    if (v.score !== null && v.score < 1 && v.scoreDisplayMode !== "informative" && v.scoreDisplayMode !== "notApplicable") {
      console.log("  abaixo de 100:", k, "-", v.title, v.displayValue || "");
    }
  }
  if (Object.values(c).some((s) => s < 90) || a["is-crawlable"].score !== 1) bad = 1;
}
process.exit(bad);
