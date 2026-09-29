import type { PermissionScopeName } from "@fitburn/contracts";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard.js";

/** Quem está pedindo, com o escopo efetivo no módulo da rota. */
export interface ScopedRequester {
  userId: string;
  scope: PermissionScopeName;
}

/** Quem faz a requisição, com o escopo que o PermissionsGuard resolveu para a rota. */
export function requesterOf(req: AuthenticatedRequest): ScopedRequester {
  return { userId: req.authUser.sub, scope: req.authScope! };
}
