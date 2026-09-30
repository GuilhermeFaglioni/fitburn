import {
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  type PermissionScopeName,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
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

/** Exige acesso a todos os registros do módulo (escopo total); senão, 403 OUT_OF_SCOPE com a `message`. */
export function assertFullScope(requester: ScopedRequester, message: string): void {
  if (requester.scope !== PermissionScope.ALL) {
    throw new DomainError(ErrorCode.OUT_OF_SCOPE, message, ErrorStatus.FORBIDDEN);
  }
}

/**
 * Escopo do módulo Usuários (o registro alvo é outro usuário, sem relação de
 * atribuição): só o escopo total age sobre qualquer usuário; qualquer outro
 * escopo age apenas sobre si mesmo (a mesma leitura restritiva da listagem).
 * Outro usuário: 403 OUT_OF_SCOPE, antes de tocar em qualquer dado.
 */
export function assertUserInScope(requester: ScopedRequester, targetUserId: string): void {
  if (requester.scope !== PermissionScope.ALL && targetUserId !== requester.userId) {
    throw new DomainError(
      ErrorCode.OUT_OF_SCOPE,
      "Você só pode acessar os próprios dados.",
      ErrorStatus.FORBIDDEN,
    );
  }
}
