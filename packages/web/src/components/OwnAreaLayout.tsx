import { useAuth } from "../lib/auth/AuthContext";
import { isClientUser } from "../lib/auth/areas";
import { AdminLayout } from "./AdminLayout";
import { ClientLayout } from "./ClientLayout";

/**
 * Casca das telas que existem para qualquer usuário (Perfil / Minha conta): a
 * do cliente para o perfil Cliente, a administrativa para a equipe. Roda
 * dentro do ProtectedRoute, com o usuário já autenticado.
 */
export function OwnAreaLayout() {
  const { user } = useAuth();
  if (!user) return null;
  return isClientUser(user) ? <ClientLayout /> : <AdminLayout />;
}
