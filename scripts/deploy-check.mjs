#!/usr/bin/env node
// Verificação pré-deploy (pnpm deploy:check).
//
// Hoje confere um único ponto que a Vercel não valida sozinha: o rewrite de /api no
// vercel.json ainda aponta para o domínio de exemplo (*.example)? Nesse caso a Vercel
// publica normalmente, mas todo /api do frontend fica quebrado, sem nenhum aviso.
//
//   pnpm deploy:check             avisa (exit 0), útil no dia a dia e no CI
//   pnpm deploy:check --strict    falha (exit 1) se o placeholder continuar; rode antes do deploy
//   --vercel-file <caminho>       usa outro vercel.json (usado pelos testes)
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const fileFlag = args.indexOf("--vercel-file");
const vercelFile =
  fileFlag >= 0 && args[fileFlag + 1] ? args[fileFlag + 1] : path.join(root, "vercel.json");

/** Domínios reservados para exemplo (RFC 2606): nunca são um backend real. */
function isPlaceholderHost(host) {
  return /(^|\.)example(\.(com|net|org))?$/i.test(host);
}

let config;
try {
  config = JSON.parse(readFileSync(vercelFile, "utf8"));
} catch (error) {
  console.error(`deploy:check: não consegui ler ${vercelFile}: ${error.message}`);
  process.exit(2);
}

const apiRewrite = (config.rewrites ?? []).find((rewrite) =>
  String(rewrite.source).startsWith("/api/"),
);
if (!apiRewrite) {
  console.error('deploy:check: o vercel.json não tem o rewrite de "/api/:path*".');
  process.exit(2);
}

let host;
try {
  host = new URL(apiRewrite.destination.replace(":path*", "x")).hostname;
} catch {
  console.error(`deploy:check: destino do rewrite inválido: ${apiRewrite.destination}`);
  process.exit(2);
}

if (isPlaceholderHost(host)) {
  const message =
    `vercel.json ainda aponta /api para o placeholder "${host}". ` +
    "Troque pelo DOMAIN real da API (docs/deploy-runbook.md, seção 8) antes de publicar na Vercel; " +
    "senão o frontend sobe com /api quebrado, sem aviso.";
  if (strict) {
    console.error(`deploy:check (--strict) FALHOU: ${message}`);
    process.exit(1);
  }
  console.warn(`deploy:check AVISO: ${message} (use --strict para falhar antes do deploy)`);
} else {
  console.log(`deploy:check: rewrite de /api aponta para ${host}.`);
}
