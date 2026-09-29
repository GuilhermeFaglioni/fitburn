import { Outlet } from "react-router-dom";
import { AppMenu } from "./AppMenu";

/**
 * Casca das telas administrativas (Dashboard, Usuários e perfis, ...):
 * sidebar escura + conteúdo claro, como em project/UsuariosPerfis.dc.html no
 * canvas de design. É uma layout route própria porque o Cliente (Home) usa
 * uma casca completamente diferente no mesmo canvas. No mobile a barra lateral
 * vira uma barra superior com o botão Menu (o canvas só tem o desktop).
 */
export function AdminLayout() {
  return (
    <div className="fb-admin-shell">
      <AppMenu />
      <main id="conteudo" tabIndex={-1} className="fb-admin-content">
        <Outlet />
      </main>
    </div>
  );
}
