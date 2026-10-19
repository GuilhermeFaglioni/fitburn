import { trackedFetch } from "../connectivity/connectivity-store";
import { refreshSessionOutcome, type RefreshOutcome } from "./api";
import { emitSessionEnded } from "./session-events";
import { tokenStore } from "./token-store";

let inFlightRefresh: Promise<RefreshOutcome> | null = null;

// Várias chamadas simultâneas que tomam 401 ao mesmo tempo compartilham a
// mesma tentativa de refresh, em vez de disparar uma renovação cada uma.
function refreshOnce() {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshSessionOutcome()
      .then((outcome) => {
        if (outcome.status === "ended") emitSessionEnded();
        return outcome;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

/**
 * fetch autenticado: anexa o access token e, se a resposta vier 401 (token
 * expirado), tenta renovar a sessão uma única vez e repete a requisição
 * original. Se a sessão tiver terminado, avisa o AuthProvider; falhas
 * transitórias só devolvem a resposta 401 original.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    trackedFetch(input, {
      ...init,
      credentials: "include",
      headers: { ...init.headers, Authorization: `Bearer ${tokenStore.get() ?? ""}` },
    });

  const response = await doFetch();
  if (response.status !== 401) {
    return response;
  }

  const outcome = await refreshOnce();
  if (outcome.status === "ended" || outcome.status === "transient") {
    return response;
  }

  return doFetch();
}
