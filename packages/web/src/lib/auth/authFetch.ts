import { refreshSession } from "./api";
import { tokenStore } from "./token-store";

let inFlightRefresh: ReturnType<typeof refreshSession> | null = null;

// Várias chamadas simultâneas que tomam 401 ao mesmo tempo compartilham a
// mesma tentativa de refresh, em vez de disparar uma renovação cada uma.
function refreshOnce() {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshSession().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/**
 * fetch autenticado: anexa o access token e, se a resposta vier 401 (token
 * expirado), tenta renovar a sessão uma única vez e repete a requisição
 * original. Se a renovação falhar, devolve a resposta 401 original — quem
 * chamou decide o que fazer (normalmente: mandar para o login).
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(input, {
      ...init,
      credentials: "include",
      headers: { ...init.headers, Authorization: `Bearer ${tokenStore.get() ?? ""}` },
    });

  const response = await doFetch();
  if (response.status !== 401) {
    return response;
  }

  const refreshedUser = await refreshOnce();
  if (!refreshedUser) {
    return response;
  }

  return doFetch();
}
