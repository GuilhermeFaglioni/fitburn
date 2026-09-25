import type { ReactNode } from "react";
import { useAuth } from "../lib/auth/AuthContext";
import { AppMenu } from "./AppMenu";

/**
 * Casca de layout base: fundo, cor de texto e tipografia da marca já vêm do
 * global.css aplicado ao body. Este componente existe como um ponto único e
 * testável de onde a árvore da aplicação é montada. O menu só aparece para
 * quem já entrou — a tela de login não tem navegação.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  return (
    <div
      data-testid="app-shell"
      style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}
    >
      {isAuthenticated && <AppMenu />}
      {children}
    </div>
  );
}
