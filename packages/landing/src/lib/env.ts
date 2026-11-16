export interface LandingEnv {
  siteUrl: string;
  indexable: boolean;
  umamiSrc: string;
  umamiWebsiteId: string;
  /** Analytics só entra se as duas variáveis do Umami existirem. */
  analytics: boolean;
}

export const DEFAULT_SITE_URL = "https://site.fitburn.faglionidev.com";

export function readEnv(source: Record<string, string | undefined>): LandingEnv {
  const siteUrl = (source.PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const umamiSrc = source.PUBLIC_UMAMI_SRC?.trim() ?? "";
  const umamiWebsiteId = source.PUBLIC_UMAMI_WEBSITE_ID?.trim() ?? "";
  return {
    siteUrl,
    indexable: source.PUBLIC_INDEXABLE === "true",
    umamiSrc,
    umamiWebsiteId,
    analytics: umamiSrc !== "" && umamiWebsiteId !== "",
  };
}

export const env = readEnv(process.env);
