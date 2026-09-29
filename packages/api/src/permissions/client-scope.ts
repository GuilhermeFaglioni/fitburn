import type { Prisma } from "@prisma/client";
import { ErrorCode, ErrorStatus, PermissionScope, ReservationStatus } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import type { ScopedRequester } from "./scoped-requester.js";

/**
 * Filtro dos clientes que o escopo do perfil enxerga:
 * - "todos": qualquer cliente;
 * - "clientes atribuídos" (e "aulas atribuídas", que para clientes significa
 *   o mesmo): quem tem reserva viva — confirmada, concluída ou não
 *   compareceu — numa aula em que a pessoa é o professor. Quem cancelou não
 *   está mais na aula;
 * - "próprios": só a própria pessoa.
 */
export function clientScopeFilter(requester: ScopedRequester): Prisma.UserWhereInput {
  switch (requester.scope) {
    case PermissionScope.ALL:
      return {};
    case PermissionScope.ASSIGNED_CLIENTS:
    case PermissionScope.ASSIGNED_CLASSES:
      return {
        reservations: {
          some: {
            status: { not: ReservationStatus.CANCELLED },
            occurrence: { instructorId: requester.userId },
          },
        },
      };
    case PermissionScope.OWN:
      return { id: requester.userId };
    default:
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        "Escopo sem acesso aos clientes.",
        ErrorStatus.FORBIDDEN,
      );
  }
}
