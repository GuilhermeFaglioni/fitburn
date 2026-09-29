import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";
import { visibleAdminMenuItems } from "../lib/auth/areas";
import "./AppMenu.css";
import { RequiresNetwork } from "./RequiresNetwork";

/**
 * Navegação administrativa: barra lateral fixa no desktop; no mobile, uma barra
 * superior com o botão "Menu" que abre a mesma navegação como gaveta. O
 * mobile/desktop é decidido só por CSS (AppMenu.css); a gaveta fechada fica com
 * visibility:hidden, então seus links saem da tabulação e da árvore de acessibilidade.
 */
export function AppMenu() {
  const { user, logout } = useAuth();
  const visibleItems = user ? visibleAdminMenuItems(user) : [];
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  // Escolher uma tela fecha a gaveta.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <>
      <div className="app-topbar">
        <span className="app-topbar__brand">FITBURN</span>
        <button
          ref={toggleRef}
          type="button"
          className="app-topbar__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          Menu
        </button>
      </div>
      {open && (
        <div className="app-menu__scrim" aria-hidden="true" onClick={() => setOpen(false)} />
      )}
      <div id={panelId} className={`app-menu${open ? " app-menu--open" : ""}`}>
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
            <RequiresNetwork>
              <button type="button" className="app-menu__logout" onClick={() => void logout()}>
                Sair
              </button>
            </RequiresNetwork>
          </div>
        )}
      </div>
    </>
  );
}
