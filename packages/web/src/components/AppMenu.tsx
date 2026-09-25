import { NavLink } from "react-router-dom";
import { Module, PermissionAction, type ModuleName } from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import "./AppMenu.css";

interface MenuItem {
  module: ModuleName;
  label: string;
  to: string;
}

// Cada ticket futuro que adicionar uma tela real ganha sua própria entrada
// aqui — a lista cresce com o produto, o filtro por permissão não muda.
const MENU_ITEMS: MenuItem[] = [
  { module: Module.DASHBOARD, label: "Dashboard", to: "/dashboard" },
  { module: Module.USUARIOS, label: "Usuários", to: "/usuarios" },
];

export function AppMenu() {
  const { can } = useAuth();
  const visibleItems = MENU_ITEMS.filter((item) => can(item.module, PermissionAction.VIEW));

  if (visibleItems.length === 0) return null;

  return (
    <nav className="app-menu" aria-label="Navegação principal">
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
  );
}
