import { Outlet } from "react-router-dom";
import { AppMenu } from "./AppMenu";
import { useFocusOnNavigation } from "./useFocusOnNavigation";

/**
 * Casca das telas administrativas (Dashboard, Usuários e perfis, ...):
 * sidebar escura + conteúdo claro. É uma layout route própria porque o Cliente (Home) usa
 * uma casca completamente diferente. No mobile a barra lateral
 * vira uma barra superior com o botão Menu (a proposta só mostra o desktop).
 */
export function AdminLayout() {
  const mainRef = useFocusOnNavigation();
  return (
    <div className="fb-admin-shell">
      <AppMenu />
      <main ref={mainRef} id="conteudo" tabIndex={-1} className="fb-admin-content">
        <Outlet />
      </main>
    </div>
  );
}
