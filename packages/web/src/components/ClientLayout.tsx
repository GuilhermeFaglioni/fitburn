import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BottomNav, type BottomNavItem } from "./ui/BottomNav";
import { ThemeToggle } from "./ThemeToggle";
import { useHostThemeToggle } from "./themeToggleHost";
import { useFocusOnNavigation } from "./useFocusOnNavigation";
import { FlameMark } from "./icons/FlameMark";
import {
  AgendaNavIcon,
  FitPointsNavIcon,
  HomeNavIcon,
  ProfileNavIcon,
  WorkoutNavIcon,
} from "./icons/ClientNavIcons";

interface ClientNavItem {
  to: string;
  /** Rótulo na barra lateral (desktop). */
  label: string;
  /** Rótulo na barra inferior (celular): o design usa "Treino" onde a lateral diz "Ficha de treino". */
  tabLabel: string;
  icon: ReactNode;
  end?: boolean;
}

/** Os cinco destinos do cliente (D-038, decisão do dono na issue 156: a barra inferior tem 5 itens, com FitPoints). */
const ITEMS: readonly ClientNavItem[] = [
  { to: "/", label: "Início", tabLabel: "Início", icon: <HomeNavIcon />, end: true },
  { to: "/agenda", label: "Agenda", tabLabel: "Agenda", icon: <AgendaNavIcon /> },
  { to: "/fitpoints", label: "FitPoints", tabLabel: "FitPoints", icon: <FitPointsNavIcon /> },
  { to: "/ficha-treino", label: "Ficha de treino", tabLabel: "Treino", icon: <WorkoutNavIcon /> },
  { to: "/perfil", label: "Perfil", tabLabel: "Perfil", icon: <ProfileNavIcon /> },
];

const BOTTOM_ITEMS: readonly BottomNavItem[] = ITEMS.map(({ to, tabLabel, icon, end }) => ({
  to,
  label: tabLabel,
  icon,
  end,
}));

/** Tela atual, para o padding do conteúdo (o design usa um padding por tela, ver client.css). */
function screenOf(pathname: string): string {
  return pathname === "/" ? "home" : pathname.split("/")[1];
}

function Brand({ className }: { className?: string }) {
  return (
    <span className={className ? `fb-client__brand ${className}` : "fb-client__brand"}>
      <FlameMark className="fb-client__brand-mark" />
      FITBURN
    </span>
  );
}

/**
 * Casca do cliente: cabeçalho com a marca e o botão de tema; navegação lateral no desktop (sem "Sair": a saída é
 * "Sair da conta" no Perfil) e barra inferior de 5 itens no celular. O botão de tema mora no cabeçalho, então o
 * AppShell não desenha o botão fixo (ver `useHostThemeToggle`).
 */
export function ClientLayout() {
  const mainRef = useFocusOnNavigation();
  const { pathname } = useLocation();
  useHostThemeToggle();

  return (
    <div className="fb-client">
      <nav className="fb-client__sidebar" aria-label="Navegação principal">
        <Brand />
        <div className="fb-client__nav">
          {ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `fb-client__nav-item${isActive ? " active" : ""}`}
            >
              <span className="fb-client__nav-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </NavLink>
          ))}
        </div>
        <nav aria-label="Documentos legais" className="fb-client__legal-nav">
          <NavLink to="/privacidade" className="fb-client__nav-item">
            Política de privacidade
          </NavLink>
          <NavLink to="/termos" className="fb-client__nav-item">
            Termos de uso
          </NavLink>
        </nav>
      </nav>

      <div className="fb-client__body">
        <header className="fb-client__top">
          {/* No desktop a marca fica na lateral; o cabeçalho a mostra só no celular (client.css). */}
          <Brand className="fb-client__brand--top" />
          <ThemeToggle inline />
        </header>

        <main
          ref={mainRef}
          id="conteudo"
          tabIndex={-1}
          className="fb-client__content"
          data-screen={screenOf(pathname)}
        >
          <Outlet />
          <nav aria-label="Documentos legais" className="fb-client__legal-footer">
            <NavLink to="/privacidade">Política de privacidade</NavLink>
            <NavLink to="/termos">Termos de uso</NavLink>
          </nav>
        </main>
      </div>

      <BottomNav className="fb-client__tabbar" label="Navegação inferior" items={BOTTOM_ITEMS} />
    </div>
  );
}
