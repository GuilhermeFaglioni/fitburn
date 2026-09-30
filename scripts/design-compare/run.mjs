#!/usr/bin/env node
/**
 * Comparação visual design x app.
 *
 *   pnpm design:compare                 # design + app + comparação + relatório
 *   pnpm design:compare design          # só renderiza os artboards
 *   pnpm design:compare app             # só captura o app (API+Vite precisam estar de pé)
 *   pnpm design:compare compare         # só compara os PNGs já gerados
 *   pnpm design:compare all --only=Login,HomeMobile
 */
import { CAPTURES } from "./lib/captures.mjs";
import { captureApp } from "./lib/capture-app.mjs";
import { compareAll } from "./lib/compare.mjs";
import { renderDesign } from "./lib/render-design.mjs";

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "all";
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : undefined;

if (!["all", "design", "app", "compare"].includes(command)) {
  console.error(`Comando desconhecido: ${command}. Use all | design | app | compare.`);
  process.exit(1);
}

let designResults = [];
let appResults = [];
if (command === "all" || command === "design")
  designResults = await renderDesign(CAPTURES, { only });
if (command === "all" || command === "app") appResults = await captureApp(CAPTURES, { only });
if (command === "all" || command === "compare") {
  const summary = await compareAll(CAPTURES, { only });
  console.log(`\nRelatório: ${summary.reportPath}`);
}
const failed = [...designResults, ...appResults].filter((r) => !r.ok);
if (failed.length) console.log(`\n${failed.length} captura(s) falharam (veja acima).`);
