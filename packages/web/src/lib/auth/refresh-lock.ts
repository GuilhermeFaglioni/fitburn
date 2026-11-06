/**
 * Coordena a renovação da sessão entre abas do mesmo navegador.
 *
 * O refresh token é um cookie httpOnly compartilhado por todas as abas e a API
 * o rotaciona a cada /auth/refresh: reapresentar um token já consumido revoga
 * todas as sessões. Duas abas que renovam ao mesmo tempo mandariam o mesmo
 * cookie, e a segunda derrubaria a sessão inteira.
 *
 * Um lock exclusivo (Web Locks API) faz as abas renovarem uma de cada vez. A
 * seguinte só entra depois de o navegador ter aplicado o Set-Cookie da
 * renovação anterior, então cada aba envia o cookie vigente e recebe o próprio
 * access token (que continua só em memória, sem canal entre abas).
 */
export const REFRESH_LOCK_NAME = "fitburn:auth-refresh";

/**
 * Executa `work` com o lock de renovação. `work` nunca deve lançar (assim o
 * lock é sempre liberado). Sem `navigator.locks` (ambiente antigo ou contexto
 * inseguro), ou se o navegador recusar o pedido do lock, executa direto: o
 * comportamento é o de antes do lock e a API segue recusando replay.
 */
export async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return work();

  let started = false;
  try {
    return await locks.request(REFRESH_LOCK_NAME, () => {
      started = true;
      return work();
    });
  } catch (error) {
    if (started) throw error;
    return work();
  }
}
