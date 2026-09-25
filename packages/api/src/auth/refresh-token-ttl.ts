const DEFAULT_TTL_DAYS = 7;

export function refreshTokenTtlMs(): number {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}
