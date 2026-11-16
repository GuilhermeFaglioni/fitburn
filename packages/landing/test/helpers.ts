import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const dist = join(root, "dist");

export function readDist(file: string, outDir: string = dist): string {
  return readFileSync(join(outDir, file), "utf8");
}

export function page(file = "index.html", outDir: string = dist) {
  return parse(readDist(file, outDir));
}

/** Roda `astro build` com variáveis próprias num outDir temporário e devolve o caminho. */
export function buildWith(env: Record<string, string>): string {
  // Dentro do pacote: o Astro move arquivos por rename, que falha entre sistemas de arquivos diferentes.
  const out = mkdtempSync(join(root, ".build-"));
  execFileSync(process.execPath, [join(root, "node_modules/astro/bin/astro.mjs"), "build"], {
    cwd: root,
    env: { ...process.env, ...env, LANDING_OUT_DIR: out, ASTRO_TELEMETRY_DISABLED: "1" },
    stdio: "pipe",
  });
  return out;
}

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function distExists(): boolean {
  return existsSync(join(dist, "index.html"));
}
