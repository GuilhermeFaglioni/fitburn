/**
 * Tutorial de instalação do PWA (#177). A marca de "já visto" é por aparelho: vive em localStorage (chave
 * `fb-pwa-tutorial-seen`), sem API. Todo acesso ao storage é protegido (modo privado e bloqueio de dados do site fazem
 * a leitura e a escrita lançar); sem storage, a marca fica só na memória da sessão, e o tutorial abre no máximo uma
 * vez por sessão, sem loop.
 */
export const TUTORIAL_SEEN_KEY = "fb-pwa-tutorial-seen";

export type InstallPlatform = "ios" | "android";

/** Marca em memória, usada quando o storage não deixa gravar. Dura a sessão da página. */
let seenInSession = false;

/** Só para a suíte de testes: zera (ou força) a marca em memória. */
export function setTutorialSessionSeen(value: boolean): void {
  seenInSession = value;
}

/** O tutorial deve abrir sozinho? Sim, se este aparelho (ou esta sessão, sem storage) ainda não o viu. */
export function shouldAutoOpenTutorial(): boolean {
  if (seenInSession) return false;
  try {
    return window.localStorage.getItem(TUTORIAL_SEEN_KEY) === null;
  } catch {
    // Sem leitura não dá para saber: abre uma vez e a marca em memória (markTutorialSeen) evita o loop.
    return true;
  }
}

export function markTutorialSeen(): void {
  seenInSession = true;
  try {
    window.localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
  } catch {
    // Sem storage vale a marca em memória, definida acima.
  }
}

/** iOS quando o aparelho é iPhone, iPad ou iPod (o iPadOS 13+ se apresenta como Mac, mas tem tela de toque). */
export function detectInstallPlatform(): InstallPlatform {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (platform === "MacIntel" && maxTouchPoints > 1) return "ios";
  return "android";
}
