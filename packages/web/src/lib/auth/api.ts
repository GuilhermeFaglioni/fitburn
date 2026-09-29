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

/** Resultado de uma tentativa de renovar a sessão via /auth/refresh. */
export type RefreshOutcome =
  | { status: "ok"; user: CurrentUser }
  /** O servidor recusou (401/403): cookie ausente, expirado ou revogado. A sessão acabou. */
  | { status: "ended" }
  /**
   * Não deu para saber se a sessão vale: sem rede ("network"), ou o servidor/proxy
   * falhou ou limitou ("server": 429, 5xx, resposta ilegível). O token em memória é mantido.
   */
  | { status: "transient"; reason: "network" | "server" };

/**
 * Chama /auth/refresh (o cookie httpOnly viaja sozinho). Nunca lança. Só uma
 * recusa explícita (401/403) encerra a sessão e descarta o token; qualquer
 * outra falha é transitória e não pode mandar a pessoa ao login.
 */
export async function refreshSessionOutcome(): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await trackedFetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  } catch {
    // Sem rede não dá para saber se a sessão vale: o banner de "sem conexão"
    // já foi acionado pelo trackedFetch e o token em memória é preservado.
    return { status: "transient", reason: "network" };
  }
  if (response.status === 401 || response.status === 403) {
    tokenStore.set(null);
    return { status: "ended" };
  }
  if (!response.ok) return { status: "transient", reason: "server" };
  try {
    const data = loginResponseSchema.parse(await response.json());
    tokenStore.set(data.accessToken);
    return { status: "ok", user: data.user };
  } catch {
    return { status: "transient", reason: "server" };
  }
}

/**
 * Versão simples de refreshSessionOutcome: o usuário renovado ou null ("sem
 * sessão utilizável agora"), usada pelo authFetch depois de um 401. Só o
 * resultado "ended" apaga o token.
 */
export async function refreshSession(): Promise<CurrentUser | null> {
  const outcome = await refreshSessionOutcome();
  return outcome.status === "ok" ? outcome.user : null;
}
