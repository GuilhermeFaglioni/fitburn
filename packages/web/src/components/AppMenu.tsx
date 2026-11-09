import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";
import { visibleAdminMenuItems, type AdminMenuItem } from "../lib/auth/areas";
import "./AppMenu.css";
import { AdminBrand } from "./AdminBrand";
import { RequiresNetwork } from "./RequiresNetwork";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

interface AppMenuProps {
  /** `id` da gaveta (celular), para o `aria-controls` do botão Menu da casca. */
  drawerId?: string;
  /** A gaveta do celular está aberta. No desktop a navegação é a barra lateral e nunca "abre". */
  drawerOpen?: boolean;
  /** Pedido para fechar a gaveta (Esc, clique no fundo ou botão Fechar). */
  onDrawerClose?: () => void;
}

function MenuLinks({ items }: { items: AdminMenuItem[] }) {
  return (
    <>
      <nav aria-label="Navegação principal">
        <ul className="app-menu__list">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className="app-menu__link">
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Documentos legais" className="app-menu__legal">
        <NavLink to="/privacidade" className="app-menu__link app-menu__link--small">
          Política de privacidade
        </NavLink>
        <NavLink to="/termos" className="app-menu__link app-menu__link--small">
          Termos de uso
        </NavLink>
      </nav>
    </>
  );
}

function MenuAccount() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="app-menu__account">
      <div className="app-menu__account-info">
        <span className="app-menu__account-name">{user.fullName}</span>
        <span className="app-menu__account-profile">{user.profile.name}</span>
      </div>
      <NavLink to="/perfil" className="app-menu__link">
        Minha conta
      </NavLink>
      <RequiresNetwork>
        <button type="button" className="app-menu__link app-menu__logout" onClick={() => void logout()}>
          Sair
        </button>
      </RequiresNetwork>
    </div>
  );
}

/**
 * Navegação administrativa (#156, D-038): barra lateral clara de `--sidebar-w` no desktop, com a marca, as telas que
 * o perfil vê (`visibleAdminMenuItems`, na ordem do menu), os documentos legais e, no rodapé, o usuário, "Minha conta"
 * e "Sair". No celular a barra some (CSS) e a mesma navegação abre como gaveta (`Dialog` variante `drawer`), que a casca
 * aciona pelo botão Menu: aberta, o foco entra, o Tab fica preso, Esc fecha e o foco volta ao botão.
 */
export function AppMenu({ drawerId, drawerOpen = false, onDrawerClose }: AppMenuProps) {
  const { user } = useAuth();
  const items = user ? visibleAdminMenuItems(user) : [];
  if (items.length === 0) return null;

  return (
    <>
      <div className="app-menu">
        <AdminBrand />
        <div className="app-menu__scroll">
          <MenuLinks items={items} />
        </div>
        <MenuAccount />
      </div>
      {drawerOpen && (
        <Dialog
          id={drawerId}
          variant="drawer"
          title="Menu"
          onClose={() => onDrawerClose?.()}
          topBar={
            <>
              <AdminBrand />
              <Button variant="ghost" size="sm" onClick={() => onDrawerClose?.()}>
                Fechar
              </Button>
            </>
          }
          footer={<MenuAccount />}
        >
          <MenuLinks items={items} />
        </Dialog>
      )}
    </>
  );
}
