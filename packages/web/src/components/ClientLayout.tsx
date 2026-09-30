import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFocusOnNavigation } from "./useFocusOnNavigation";

type IconProps = { color: string; size: number };

function HomeIcon({ color, size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 9.5L10 3.5L17 9.5"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 8.5V16.2C5 16.6 5.3 17 5.8 17H14.2C14.7 17 15 16.6 15 16.2V8.5"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AgendaIcon({ color, size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M3 8H17" stroke={color} strokeWidth="1.4" />
      <path d="M6.5 2.5V5.5M13.5 2.5V5.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlanIcon({ color, size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M2.5 8.3H17.5" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function WorkoutIcon({ color, size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 6H16M4 10H16M4 14H12" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon({ color, size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="7" r="3" stroke={color} strokeWidth="1.4" />
      <path
        d="M3.5 17C4.5 13.5 7 12 10 12C13 12 15.5 13.5 16.5 17"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ACTIVE = "#ed6e34";
const INACTIVE = "rgba(255,255,255,0.65)";

/** `label` na barra lateral (desktop) e `tabLabel` na barra inferior (mobile): o design usa "Ficha de treino" e "Treino". */
const ITEMS = [
  { to: "/", label: "Home", tabLabel: "Home", Icon: HomeIcon },
  { to: "/agenda", label: "Agenda", tabLabel: "Agenda", Icon: AgendaIcon },
  { to: "/plano", label: "Plano", tabLabel: "Plano", Icon: PlanIcon },
  { to: "/ficha-treino", label: "Ficha de treino", tabLabel: "Treino", Icon: WorkoutIcon },
  { to: "/perfil", label: "Perfil", tabLabel: "Perfil", Icon: ProfileIcon },
];

/** Tela atual, para o padding do conteúdo (o design usa um padding por tela, ver client.css). */
function screenOf(pathname: string): string {
  return pathname === "/" ? "home" : pathname.split("/")[1];
}

/**
 * Casca do cliente: sidebar no desktop (ícones de 18px, sem "Sair": a saída é "Sair da conta" no Perfil) e barra
 * inferior no mobile (ícones de 20px), como em HomeDesktop/HomeMobile.dc.html.
 */
export function ClientLayout() {
  const mainRef = useFocusOnNavigation();
  const { pathname } = useLocation();

  return (
    <div className="fb-client">
      <nav className="fb-client__sidebar" aria-label="Navegação principal">
        <span className="fb-client__brand">FITBURN</span>
        <div className="fb-client__nav">
          {ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `fb-client__nav-item${isActive ? " active" : ""}`}
            >
              {({ isActive }) => (
                <>
                  <Icon color={isActive ? ACTIVE : INACTIVE} size={18} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <main
        ref={mainRef}
        id="conteudo"
        tabIndex={-1}
        className="fb-client__content"
        data-screen={screenOf(pathname)}
      >
        <Outlet />
      </main>

      <nav className="fb-client__tabbar" aria-label="Navegação inferior">
        {ITEMS.map(({ to, tabLabel, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `fb-client__tab${isActive ? " active" : ""}`}
          >
            {({ isActive }) => (
              <>
                <Icon color={isActive ? ACTIVE : "rgba(255,255,255,0.55)"} size={20} />
                {tabLabel}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
