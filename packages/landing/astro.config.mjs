import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Landing estática da Fitburn Brasil (D-039). Zero JS próprio; CSS sempre em arquivo
// para a CSP do nginx funcionar com `style-src 'self'`.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://site.fitburn.faglionidev.com",
  output: "static",
  trailingSlash: "never",
  build: { inlineStylesheets: "never", format: "file" },
  integrations: [sitemap()],
  vite: {
    // Fontes e imagens nunca viram data URI: a CSP é `font-src 'self'` e `img-src 'self' data:`.
    build: { assetsInlineLimit: 0 },
  },
});
