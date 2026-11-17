import type { APIRoute } from "astro";
import { env } from "../lib/env";

/**
 * Não indexável: só `Allow: /` (o bloqueio vem do `noindex` da página e do X-Robots-Tag do nginx;
 * um `Disallow` impediria o Google de ler o `noindex`). Indexável: acrescenta o sitemap.
 */
export const GET: APIRoute = () => {
  const lines = ["User-agent: *", "Allow: /"];
  if (env.indexable) lines.push("", `Sitemap: ${env.siteUrl}/sitemap-index.xml`);
  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
