import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Landing estática (D-044). CSS sempre em arquivo, para a CSP `style-src 'self'` sem 'unsafe-inline'.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? "https://site.fitburn.faglionidev.com",
  output: "static",
  trailingSlash: "never",
  outDir: process.env.LANDING_OUT_DIR ?? "dist",
  build: { inlineStylesheets: "never", format: "file" },
  integrations: [sitemap()],
});
