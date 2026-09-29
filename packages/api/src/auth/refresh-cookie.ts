import type { CookieOptions, Request, Response } from "express";
import type { AppConfig } from "../config/app-config.js";
import { refreshTokenTtlMs } from "./refresh-token-ttl.js";

export const REFRESH_COOKIE_NAME = "fitburn_refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";

function refreshCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.refreshCookie.sameSite,
    secure: config.refreshCookie.secure,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTokenTtlMs(),
  };
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME];
}

export function setRefreshCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}
