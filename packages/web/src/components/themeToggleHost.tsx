import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";

/**
 * O botão de tema vive fixo no canto (AppShell) até uma casca ter cabeçalho próprio. A casca que o hospeda avisa por
 * `useHostThemeToggle` e o AppShell deixa de desenhar o botão fixo: assim há sempre um só botão na tela.
 */
const HostContext = createContext<(hosted: boolean) => void>(() => {});

export function ThemeToggleHostProvider({
  onHostedChange,
  children,
}: {
  onHostedChange: (hosted: boolean) => void;
  children: ReactNode;
}) {
  return <HostContext.Provider value={onHostedChange}>{children}</HostContext.Provider>;
}

/** Chame na casca que renderiza `<ThemeToggle inline />` no próprio cabeçalho. */
export function useHostThemeToggle(): void {
  const setHosted = useContext(HostContext);
  useLayoutEffect(() => {
    setHosted(true);
    return () => setHosted(false);
  }, [setHosted]);
}
