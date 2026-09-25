import { cloneElement, type ReactElement } from "react";

interface BlockableProps {
  disabled?: boolean;
  "aria-disabled"?: boolean;
  title?: string;
}

interface BlockedActionProps {
  allowed: boolean;
  reason?: string;
  children: ReactElement<BlockableProps>;
}

/**
 * Bloqueio visual reutilizável para uma ação sem permissão: desabilita o
 * controle e explica o motivo via title/aria-disabled, em vez de escondê-lo
 * ou de cada tela reimplementar essa checagem.
 */
export function BlockedAction({
  allowed,
  reason = "Você não tem permissão para executar esta ação.",
  children,
}: BlockedActionProps) {
  if (allowed) return children;

  return cloneElement(children, {
    disabled: true,
    "aria-disabled": true,
    title: reason,
  });
}
