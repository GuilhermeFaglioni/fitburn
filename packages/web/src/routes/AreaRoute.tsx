import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";
import { adminRouteForClientPath, isClientUser } from "../lib/auth/areas";

/**
 * Mantém cada perfil na sua área: a equipe que abre uma tela do cliente (um
 * link antigo, a rota preservada no login) vai para a equivalente
 * administrativa, e o cliente não entra na área administrativa. Roda dentro
 * do ProtectedRoute, com o usuário já autenticado.
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
  return <>{children}</>;
}
