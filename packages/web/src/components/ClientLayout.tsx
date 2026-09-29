import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";

function HomeIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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

function AgendaIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M3 8H17" stroke={color} strokeWidth="1.4" />
      <path d="M6.5 2.5V5.5M13.5 2.5V5.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlanIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M2.5 8.3H17.5" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function WorkoutIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 6H16M4 10H16M4 14H12" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const ACTIVE = "#ed6e34";
const INACTIVE = "rgba(255,255,255,0.65)";

// Só as telas do cliente que já existem; o Perfil entra junto com a sua tela.
const ITEMS = [
  { to: "/", label: "Home", Icon: HomeIcon },
  { to: "/agenda", label: "Agenda", Icon: AgendaIcon },
  { to: "/plano", label: "Plano", Icon: PlanIcon },
  { to: "/ficha-treino", label: "Treino", Icon: WorkoutIcon },
];

/** Casca do cliente: sidebar no desktop e barra inferior no mobile (AgendaDesktop/AgendaMobile). */
export function ClientLayout() {
  const { logout } = useAuth();

  return (
    <div className="fb-client">
      <nav className="fb-client__sidebar" aria-label="Navegação principal">
        <div>
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
                    <Icon color={isActive ? ACTIVE : INACTIVE} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
        <button type="button" className="fb-client__logout" onClick={() => void logout()}>
          Sair
        </button>
      </nav>

      <main className="fb-client__content">
        <Outlet />
      </main>

      <nav className="fb-client__tabbar" aria-label="Navegação inferior">
        {ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `fb-client__tab${isActive ? " active" : ""}`}
          >
            {({ isActive }) => (
              <>
                <Icon color={isActive ? ACTIVE : "rgba(255,255,255,0.55)"} />
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          className="fb-client__tab"
          style={{ background: "none", border: "none", fontFamily: "inherit", cursor: "pointer" }}
          onClick={() => void logout()}
        >
          Sair
        </button>
      </nav>
    </div>
  );
}
