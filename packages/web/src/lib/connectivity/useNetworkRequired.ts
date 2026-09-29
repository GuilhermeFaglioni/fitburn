import { useOnline } from "./useOnline";

export const OFFLINE_REASON = "Você está sem conexão. Volte a ficar online para usar esta ação.";

/**
 * Mecanismo compartilhado das ações que exigem rede: `offline` diz se devem
 * ficar desabilitadas e `reason` é a explicação para title/aria. Para um botão
 * simples prefira <RequiresNetwork>; use o hook em controles mais elaborados
 * (formulários, links, itens de menu).
 */
export function useNetworkRequired(): { offline: boolean; reason: string } {
  return { offline: !useOnline(), reason: OFFLINE_REASON };
}
