/**
 * Estado de conexão do app, compartilhado por todo o código (inclusive fora do
 * React, como o authFetch). "Online" só vale quando as duas fontes concordam:
 * o navegador diz que há rede (navigator.onLine) E a última requisição não
 * falhou por rede. O navegador sozinho não basta — ele reporta "online" com
 * Wi-Fi sem internet — por isso as falhas de fetch também derrubam o estado.
 */

let networkFailed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function browserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Uma requisição falhou por rede (fetch rejeitou): marca o app como sem conexão. */
export function reportNetworkFailure() {
  if (networkFailed) return;
  networkFailed = true;
  emit();
}

/** Uma requisição chegou ao servidor (qualquer status): a rede está de pé. */
export function reportNetworkSuccess() {
  if (!networkFailed) return;
  networkFailed = false;
  emit();
}

/** Snapshot primitivo (estável) para useSyncExternalStore. */
export function isOnline(): boolean {
  return browserOnline() && !networkFailed;
}

export function subscribeToConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  const onOnline = () => {
    // O navegador voltou a ver rede: descarta a falha antiga e tenta de novo.
    networkFailed = false;
    listener();
  };
  const onOffline = () => listener();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

/** Só para os testes: volta ao estado inicial entre um teste e outro. */
export function resetConnectivity() {
  networkFailed = false;
  emit();
}

/**
 * fetch que alimenta o estado de conexão: se a requisição nem chega ao
 * servidor (fetch rejeita), o app passa a "sem conexão"; qualquer resposta,
 * mesmo de erro, prova que há rede. Cancelamentos (AbortError) não contam.
 */
export async function trackedFetch(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      reportNetworkFailure();
    }
    throw error;
  }
  reportNetworkSuccess();
  return response;
}
