import {
  Module,
  PermissionAction,
  SystemProfileName,
  type CurrentUser,
  type ModuleName,
} from "@fitburn/contracts";

export interface AdminMenuItem {
  modules: ModuleName[];
  label: string;
  to: string;
}

// Cada ticket futuro que adicionar uma tela real ganha sua própria entrada
// aqui — a lista cresce com o produto, o filtro por permissão não muda. Um
// item fica visível se o usuário tem VIEW em pelo menos um dos módulos
// listados (ex.: "Usuários e perfis" cobre USUARIOS e PERFIS_DE_ACESSO).
export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { modules: [Module.DASHBOARD], label: "Dashboard", to: "/dashboard" },
  {
    modules: [Module.USUARIOS, Module.PERFIS_DE_ACESSO],
    label: "Usuários e perfis",
    to: "/usuarios",
  },
  { modules: [Module.OCORRENCIAS], label: "Agenda", to: "/agenda-administrativa" },
  { modules: [Module.PRESENCA], label: "Minhas aulas", to: "/minhas-aulas" },
  {
    modules: [Module.TEMPLATES_DE_AULA],
    label: "Templates & modalidades",
    to: "/templates-e-modalidades",
  },
];

/** Telas do cliente com uma equivalente na área administrativa. */
const ADMIN_EQUIVALENT: Record<string, string> = { "/agenda": "/agenda-administrativa" };

function canView(user: CurrentUser, modules: ModuleName[]): boolean {
  return modules.some((module) =>
    user.permissions
      .find((permission) => permission.module === module)
      ?.actions.includes(PermissionAction.VIEW),
  );
}

export function visibleAdminMenuItems(user: CurrentUser): AdminMenuItem[] {
  return ADMIN_MENU_ITEMS.filter((item) => canView(user, item.modules));
}

/**
 * O perfil de sistema Cliente usa a área do cliente; qualquer outro perfil é
 * equipe e usa a área administrativa. (Nomes de perfil são únicos, então só o
 * perfil de sistema se chama "Cliente".)
 */
export function isClientUser(user: CurrentUser): boolean {
  return user.profile.name === SystemProfileName.CLIENT;
}

/** Tela inicial do perfil: Início do cliente, ou a primeira tela administrativa visível. */
export function homeRouteFor(user: CurrentUser): string {
  if (isClientUser(user)) return "/";
  return visibleAdminMenuItems(user)[0]?.to ?? "/dashboard";
}

/**
 * Para onde a equipe vai ao abrir uma tela do cliente: a equivalente
 * administrativa, se ela puder vê-la, ou a sua tela inicial.
 */
export function adminRouteForClientPath(user: CurrentUser, path: string): string {
  const equivalent = ADMIN_EQUIVALENT[path];
  const item = ADMIN_MENU_ITEMS.find((candidate) => candidate.to === equivalent);
  return item && canView(user, item.modules) ? item.to : homeRouteFor(user);
}
