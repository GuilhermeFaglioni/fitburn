import { Outlet } from "react-router-dom";
import { AppMenu } from "./AppMenu";

/**
 * Casca das telas administrativas (Dashboard, Usuários e perfis, ...):
 * sidebar escura + conteúdo claro, como em project/UsuariosPerfis.dc.html no
 * canvas de design. É uma layout route própria porque o Cliente (Home) usa
 * uma casca completamente diferente no mesmo canvas.
 */
export function AdminLayout() {
  return (
    <div style={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
      <AppMenu />
      <main className="fb-admin-content" style={{ flexGrow: 1, minWidth: 0, padding: "32px 40px", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
