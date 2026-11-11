import type { ReactElement } from "react";
import { BlockedAction } from "../../components/BlockedAction";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";

interface ShopActionProps {
  /** O usuário tem a permissão da ação? Sem ela o botão fica desabilitado, com `reason` no title. */
  allowed: boolean;
  reason: string;
  children: ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean; title?: string }>;
}

/**
 * Botão de gravar da Loja: desabilitado sem a permissão (motivo da permissão no title) e sem conexão (motivo da
 * rede). Junta `BlockedAction` e `RequiresNetwork`, que não se aninham (cada um clona o filho direto). A permissão
 * vem primeiro: sem ela, o motivo certo é o da permissão, mesmo offline.
 */
export function ShopAction({ allowed, reason, children }: ShopActionProps) {
  const { offline, reason: offlineReason } = useNetworkRequired();
  return (
    <BlockedAction allowed={allowed && !offline} reason={allowed ? offlineReason : reason}>
      {children}
    </BlockedAction>
  );
}
