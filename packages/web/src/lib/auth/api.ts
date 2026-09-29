import { loginResponseSchema, type CurrentUser } from "@fitburn/contracts";
import { trackedFetch } from "../connectivity/connectivity-store";
import { tokenStore } from "./token-store";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** A mensagem do erro da API; para qualquer outro erro, a mensagem padrão da tela. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export async function parseOrThrow(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { code?: string; message?: string; details?: unknown } | null;
    throw new ApiError(
      body?.code ?? "INTERNAL_ERROR",
      body?.message ?? "Erro inesperado.",
      body?.details,
    );
  }
  return data;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const response = await trackedFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = loginResponseSchema.parse(await parseOrThrow(response));
  tokenStore.set(data.accessToken);
  return data.user;
}

export async function logout(): Promise<void> {
  await trackedFetch("/api/auth/logout", { method: "POST", credentials: "include" });
  tokenStore.set(null);
}

/**
 * Chama /auth/refresh (o cookie httpOnly viaja sozinho). Nunca lança: uma
 * falha (cookie ausente, expirado ou revogado) só significa "sem sessão",
 * usada tanto para restaurar a sessão ao carregar a página quanto pelo
 * authFetch depois de um 401.
 */
export async function refreshSession(): Promise<CurrentUser | null> {
  let response: Response;
  try {
    response = await trackedFetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  } catch {
    // Sem rede não dá para saber se a sessão vale: o banner de "sem conexão"
    // já foi acionado pelo trackedFetch e o token em memória é preservado.
    return null;
  }
  if (!response.ok) {
    tokenStore.set(null);
    return null;
  }
  const data = loginResponseSchema.parse(await response.json());
  tokenStore.set(data.accessToken);
  return data.user;
}
