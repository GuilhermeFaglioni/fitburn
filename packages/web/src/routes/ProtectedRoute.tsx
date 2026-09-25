import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  // Enquanto a tentativa de restaurar a sessão (via /auth/refresh) ainda não
  // terminou, não redireciona para o login — isso evitaria um flash da tela
  // de login para quem só recarregou a página com uma sessão válida.
  if (isInitializing) {
    return null;
  }

  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return <>{children}</>;
}
