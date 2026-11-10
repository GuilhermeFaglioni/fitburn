/** Leitura tipada das variáveis PUBLIC_* do build, com padrões. */
export const DEFAULT_SITE_URL = "https://site.fitburn.faglionidev.com";

export interface LandingEnv {
  /** URL pública, sem barra final. */
  siteUrl: string;
  /** Só `PUBLIC_INDEXABLE="true"` libera a indexação. */
  indexable: boolean;
  /** Analytics do Umami: só existe se as duas variáveis foram informadas. */
  umami: { src: string; websiteId: string; domain: string } | null;
}

type RawEnv = Record<string, string | boolean | undefined>;

function text(value: string | boolean | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readEnv(raw: RawEnv): LandingEnv {
  const siteUrl = (text(raw.PUBLIC_SITE_URL) || DEFAULT_SITE_URL).replace(/\/+$/, "");
  let host: string;
  try {
    host = new URL(siteUrl).host;
  } catch {
    throw new Error(`PUBLIC_SITE_URL inválida: "${siteUrl}"`);
  }
  const src = text(raw.PUBLIC_UMAMI_SRC);
  const websiteId = text(raw.PUBLIC_UMAMI_WEBSITE_ID);
  return {
    siteUrl,
    indexable: text(raw.PUBLIC_INDEXABLE) === "true",
    umami: src && websiteId ? { src, websiteId, domain: host } : null,
  };
}

export const env = readEnv(import.meta.env as RawEnv);
