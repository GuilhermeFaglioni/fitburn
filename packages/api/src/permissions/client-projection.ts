import { PermissionScope, type ClientProjection, type PermissionScopeName } from "@fitburn/contracts";

/** Aplica a projeção de cliente uma vez, usando o escopo efetivo de CLIENTES. */
export function projectClientForScope<T extends ClientProjection>(
  client: T,
  scope: PermissionScopeName,
): T | ClientProjection {
  if (scope === PermissionScope.ALL) return client;

  return {
    id: client.id,
    fullName: client.fullName,
    email: client.email,
    phone: client.phone,
    status: client.status,
  };
}
