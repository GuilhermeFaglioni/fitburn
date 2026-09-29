import type { Prisma } from "@prisma/client";
import { ErrorCode, ErrorStatus, PermissionScope } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";

/**
 * Filtro de ocorrências que o escopo do perfil enxerga. "Aulas atribuídas" e
 * "próprios" valem o mesmo aqui: a ocorrência é do professor definido nela.
 * Vazio = sem restrição (todas). Um escopo que não faz sentido para aulas
 * (ex.: clientes atribuídos) não dá acesso a nenhuma.
 */
export function occurrenceScopeFilter(
  requester: ScopedRequester,
): Prisma.ClassOccurrenceWhereInput {
  switch (requester.scope) {
    case PermissionScope.ALL:
      return {};
    case PermissionScope.ASSIGNED_CLASSES:
    case PermissionScope.OWN:
      return { instructorId: requester.userId };
    default:
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        "Escopo sem acesso às aulas.",
        ErrorStatus.FORBIDDEN,
      );
  }
}

/** A ocorrência (pelo professor dela) está dentro do escopo? Sem restrição, sempre. */
export function isOccurrenceInScope(
  instructorId: string | null,
  requester: ScopedRequester,
): boolean {
  if (Object.keys(occurrenceScopeFilter(requester)).length === 0) return true;
  return instructorId === requester.userId;
}
