import { cloneElement, type ReactElement } from "react";
import { useNetworkRequired } from "../lib/connectivity/useNetworkRequired";

interface NetworkBlockableProps {
  disabled?: boolean;
  "aria-disabled"?: boolean;
  title?: string;
}

/**
 * Envolve uma ação que exige rede (reservar, cancelar, salvar, registrar
 * presença...): sem conexão o controle fica desabilitado e explica o motivo,
 * em vez de falhar silenciosamente. Nunca reabilita um controle que a tela já
 * mantinha desabilitado por outro motivo.
 */
export function RequiresNetwork({ children }: { children: ReactElement<NetworkBlockableProps> }) {
  const { offline, reason } = useNetworkRequired();
  if (!offline) return children;

  return cloneElement(children, {
    disabled: true,
    "aria-disabled": true,
    title: children.props.disabled && children.props.title ? children.props.title : reason,
  });
}
