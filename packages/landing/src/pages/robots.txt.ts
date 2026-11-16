import type { APIRoute } from "astro";
import { env } from "../lib/env";

export const GET: APIRoute = () => {
  const lines = ["User-agent: *", "Allow: /"];
  if (env.indexable) lines.push("", `Sitemap: ${env.siteUrl}/sitemap-index.xml`);
  return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
