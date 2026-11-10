import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type HTMLElement } from "node-html-parser";

export const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DIST = join(ROOT, "dist");
export const WEB_TOKENS = resolve(ROOT, "../web/src/styles/tokens.css");

/** Valores do `site.ts`/`copy.ts` e a URL padrão: o build padrão dos testes não define nenhuma PUBLIC_*. */
export const DEFAULT_SITE_URL = "https://site.fitburn.faglionidev.com";

export function readDist(file: string): string {
  const path = join(DIST, file);
  if (!existsSync(path)) {
    throw new Error(`${path} não existe: rode "pnpm --filter @fitburn/landing build" antes.`);
  }
  return readFileSync(path, "utf8");
}

export function page(file = "index.html"): HTMLElement {
  return parse(readDist(file));
}

/** Texto visível de um nó, com espaços normalizados. */
export function textOf(node: { textContent: string }): string {
  return node.textContent.replace(/\s+/g, " ").trim();
}

/** Roda `astro build` num outDir temporário com as variáveis pedidas e devolve o caminho. */
export function buildTo(env: Record<string, string>): string {
  const outDir = mkdtempSync(join(tmpdir(), "landing-"));
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PUBLIC_")),
  );
  execFileSync(join(ROOT, "node_modules/.bin/astro"), ["build", "--outDir", outDir], {
    cwd: ROOT,
    env: { ...clean, ...env },
    stdio: "pipe",
  });
  return outDir;
}

export function readFrom(dir: string, file: string): string {
  return readFileSync(join(dir, file), "utf8");
}

/** Todos os arquivos (caminhos relativos) abaixo de `dir`. */
export function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [full.slice(base.length + 1)];
  });
}
