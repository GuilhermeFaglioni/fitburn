import { NavLink } from "react-router-dom";
import { Module, PermissionAction, type ModuleName } from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import "./AppMenu.css";

interface MenuItem {
  modules: ModuleName[];
  label: string;
  to: string;
}

// Cada ticket futuro que adicionar uma tela real ganha sua própria entrada
// aqui — a lista cresce com o produto, o filtro por permissão não muda. Um
// item fica visível se o usuário tem VIEW em pelo menos um dos módulos
// listados (ex.: "Usuários e perfis" cobre USUARIOS e PERFIS_DE_ACESSO).
const MENU_ITEMS: MenuItem[] = [
  { modules: [Module.DASHBOARD], label: "Dashboard", to: "/dashboard" },
  {
    modules: [Module.USUARIOS, Module.PERFIS_DE_ACESSO],
    label: "Usuários e perfis",
    to: "/usuarios",
  },
];

export function AppMenu() {
  const { can, user, logout } = useAuth();
  const visibleItems = MENU_ITEMS.filter((item) =>
    item.modules.some((module) => can(module, PermissionAction.VIEW)),
  );

  if (visibleItems.length === 0) return null;

  return (
    <div className="app-menu">
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <span className="app-menu__brand">FITBURN</span>
        <nav aria-label="Navegação principal">
          <ul className="app-menu__list">
            {visibleItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `app-menu__link${isActive ? " active" : ""}`}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {user && (
        <div className="app-menu__account">
          <div className="app-menu__account-info">
            <span className="app-menu__account-name">{user.fullName}</span>
            <span className="app-menu__account-profile">{user.profile.name}</span>
          </div>
          <button type="button" className="app-menu__logout" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
