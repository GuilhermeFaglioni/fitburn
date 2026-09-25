import type { ReactNode } from "react";

/**
 * Casca de layout base: fundo, cor de texto e tipografia da marca já vêm do
 * global.css aplicado ao body. Este componente existe como um ponto único e
 * testável de onde a árvore da aplicação é montada. A navegação (sidebar)
 * é própria das telas administrativas — ver AdminLayout — porque o Cliente e
 * o Login têm cascas visuais totalmente diferentes no design.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="app-shell"
      style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}
    >
      {children}
    </div>
  );
}
