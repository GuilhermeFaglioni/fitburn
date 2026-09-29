import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";
import { visibleAdminMenuItems } from "../lib/auth/areas";
import "./AppMenu.css";

export function AppMenu() {
  const { user, logout } = useAuth();
  const visibleItems = user ? visibleAdminMenuItems(user) : [];

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
            <NavLink
              to="/perfil"
              className={({ isActive }) => `app-menu__account-link${isActive ? " active" : ""}`}
            >
              Minha conta
            </NavLink>
          </div>
          <button type="button" className="app-menu__logout" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
