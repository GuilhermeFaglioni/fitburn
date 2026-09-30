import path from "node:path";
import { ROOT } from "./env.mjs";

/** Onde ficam as saídas (ignorado pelo git). */
export const OUT_DIR = path.resolve(ROOT, process.env.DESIGN_COMPARE_OUT ?? "tmp/design-compare");
export const DESIGN_OUT = path.join(OUT_DIR, "design");
export const APP_OUT = path.join(OUT_DIR, "app");
export const DIFF_OUT = path.join(OUT_DIR, "diff");

/**
 * Pasta com o design baixado do Claude Design: `project/*.dc.html`,
 * `project/canvas.json` e `artifact-type/dc-runtime.js`. Veja o README.
 */
export const DESIGN_DIR = path.resolve(ROOT, process.env.DESIGN_DIR ?? "tmp/design-compare/source");
