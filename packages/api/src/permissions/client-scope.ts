import type { Prisma, PrismaClient } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  ReservationStatus,
  SystemProfileName,
  UserStatus,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import type { ScopedRequester } from "./scoped-requester.js";

/** Usuário do perfil de sistema Cliente. */
export const CLIENT_PROFILE_WHERE = {
  profile: { name: SystemProfileName.CLIENT, isSystem: true },
} satisfies Prisma.UserWhereInput;

/** Cliente com cadastro ativo. */
export const ACTIVE_CLIENT_WHERE = {
  status: UserStatus.ACTIVE,
  ...CLIENT_PROFILE_WHERE,
} satisfies Prisma.UserWhereInput;

/**
 * Clientes que contam nos agregados históricos: os ativos e os excluídos
 * (anonimizados). Quem foi excluído deixa de ser cliente ativo, mas o que
 * fez (pontos, presenças) continua nos números do período.
 */
export const HISTORICAL_CLIENT_WHERE = {
  status: { in: [UserStatus.ACTIVE, UserStatus.DELETED] },
  ...CLIENT_PROFILE_WHERE,
} satisfies Prisma.UserWhereInput;

/**
 * Filtro dos clientes que o escopo do perfil enxerga:
 * - "todos": qualquer cliente;
 * - "clientes atribuídos" (e "aulas atribuídas", que para clientes significa
 *   o mesmo): quem tem reserva viva — confirmada, concluída ou não
 *   compareceu — numa aula em que a pessoa é o professor (quem cancelou não
 *   está mais na aula) e quem a administração atribuiu a ela manualmente;
 * - "próprios": só a própria pessoa.
 */
export function clientScopeFilter(requester: ScopedRequester): Prisma.UserWhereInput {
  switch (requester.scope) {
    case PermissionScope.ALL:
      return {};
    case PermissionScope.ASSIGNED_CLIENTS:
    case PermissionScope.ASSIGNED_CLASSES:
      return {
        OR: [
          {
            reservations: {
              some: {
                status: { not: ReservationStatus.CANCELLED },
                occurrence: { instructorId: requester.userId },
              },
            },
          },
          { clientAssignments: { some: { teacherId: requester.userId } } },
        ],
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

/**
 * Garante que `clientId` é um cliente e está no escopo de quem pede: 404 se não
 * existe (ou não é cliente), 403 OUT_OF_SCOPE se está fora do escopo.
 */
export async function assertClientInScope(
  prisma: Pick<PrismaClient, "user">,
  clientId: string,
  requester: ScopedRequester,
): Promise<void> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, ...CLIENT_PROFILE_WHERE },
    select: { id: true },
  });
  if (!client) {
    throw new DomainError(ErrorCode.NOT_FOUND, "Cliente não encontrado.", ErrorStatus.NOT_FOUND);
  }

  // AND, não spread: o filtro de escopo "próprio" também é uma condição sobre `id`.
  const inScope = await prisma.user.count({
    where: { AND: [{ id: clientId }, clientScopeFilter(requester)] },
  });
  if (inScope === 0) {
    throw new DomainError(
      ErrorCode.OUT_OF_SCOPE,
      "Este cliente está fora do seu escopo.",
      ErrorStatus.FORBIDDEN,
    );
  }
}

/** O cliente precisa existir, ser cliente e estar ativo (400 se não for). */
export async function assertIsActiveClient(
  prisma: Pick<PrismaClient, "user">,
  clientId: string,
): Promise<void> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, ...ACTIVE_CLIENT_WHERE },
    select: { id: true },
  });
  if (!client) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      "O cliente precisa ser um cliente ativo.",
      ErrorStatus.VALIDATION,
    );
  }
}
