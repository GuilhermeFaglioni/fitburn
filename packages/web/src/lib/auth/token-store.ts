/**
 * Access token só em memória — nunca em localStorage/sessionStorage.
 * Recarregar a página sempre exige login de novo até a Fase 1 T5
 * (renovação silenciosa via cookie de refresh) existir.
 */
let accessToken: string | null = null;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  set(token: string | null): void {
    accessToken = token;
  },
};
