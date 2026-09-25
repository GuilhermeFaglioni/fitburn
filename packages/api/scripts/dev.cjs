#!/usr/bin/env node
// Dev loop: compila uma vez (para dist/main.js existir), depois mantém
// `tsc --watch` e `node --watch` rodando em paralelo.
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const buildOnce = spawnSync("npx", ["tsc", "-p", "tsconfig.build.json"], {
  stdio: "inherit",
  env: process.env,
});
if (buildOnce.status !== 0) {
  process.exit(buildOnce.status ?? 1);
}

function run(name, cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    console.log(`[${name}] saiu com código ${code}`);
  });
  return child;
}

run("tsc", "npx", ["tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"]);
run("node", "node", ["--watch", "--enable-source-maps", "dist/main.js"]);
