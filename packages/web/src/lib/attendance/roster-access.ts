import {
  Module,
  PermissionAction,
  PermissionScope,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
} from "@fitburn/contracts";

interface RosterAccess {
  userId: string | undefined;
  can: (module: ModuleName, action: PermissionActionName) => boolean;
  scopeOf: (module: ModuleName) => PermissionScopeName | null;
}

/**
 * A pessoa pode ver a lista de alunos (a Presença) desta aula? Espelha o escopo
 * da API (`isOccurrenceInScope`): quem tem escopo total vê todas; os demais só
 * as aulas em que são o professor.
 */
export function canSeeRoster(
  instructorId: string | null | undefined,
  { userId, can, scopeOf }: RosterAccess,
): boolean {
  if (!can(Module.PRESENCA, PermissionAction.VIEW)) return false;
  if (scopeOf(Module.PRESENCA) === PermissionScope.ALL) return true;
  return userId !== undefined && instructorId === userId;
}

/** A aula é da própria pessoa (ela é o professor)? */
export function isOwnClass(
  instructorId: string | null | undefined,
  userId: string | undefined,
): boolean {
  return userId !== undefined && instructorId === userId;
}
