import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";
import {
  adminRouteForClientPath,
  canOpenAdminRoute,
  homeRouteFor,
  isClientUser,
} from "../lib/auth/areas";

/**
 * Mantém cada perfil na sua área: a equipe que abre uma tela do cliente (um
 * link antigo, a rota preservada no login) vai para a equivalente
 * administrativa, o cliente não entra na área administrativa e a equipe não abre
 * pela URL uma tela do menu que o seu perfil não pode usar. Roda dentro do
 * ProtectedRoute, com o usuário já autenticado.
 */
export function AreaRoute({ area, children }: { area: "client" | "admin"; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return null;

  const isClient = isClientUser(user);
  if (area === "client" && !isClient) {
    return <Navigate to={adminRouteForClientPath(user, location.pathname)} replace />;
  }
  if (area === "admin" && isClient) {
    return <Navigate to="/" replace />;
  }
  if (area === "admin" && !canOpenAdminRoute(user, location.pathname)) {
    // Uma rota de outro perfil (a preservada no login, um link antigo): vai para a tela inicial
    // de quem está logado — a menos que ela seja esta mesma, para não entrar em laço.
    const home = homeRouteFor(user);
    if (home !== location.pathname) return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
