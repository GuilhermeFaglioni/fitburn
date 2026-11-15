import type { ReactElement } from "react";
import { BlockedAction } from "../../components/BlockedAction";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";

interface AssessmentActionProps {
  /** O usuário tem a permissão da ação? Sem ela o botão fica desabilitado, com `reason` no title. */
  allowed: boolean;
  reason: string;
  children: ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean; title?: string }>;
}

/**
 * Botão que grava avaliações (salvar, editar, excluir): desabilitado sem a permissão (motivo da permissão no title)
 * e sem conexão (motivo da rede). A permissão vem primeiro.
 */
export function AssessmentAction({ allowed, reason, children }: AssessmentActionProps) {
  const { offline, reason: offlineReason } = useNetworkRequired();
  return (
    <BlockedAction allowed={allowed && !offline} reason={allowed ? offlineReason : reason}>
      {children}
    </BlockedAction>
  );
}
