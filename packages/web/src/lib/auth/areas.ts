import {
  Module,
  PermissionAction,
  PermissionScope,
  SystemProfileName,
  type CurrentUser,
  type ModuleName,
  type PermissionActionName,
} from "@fitburn/contracts";

export interface AdminMenuItem {
  modules: ModuleName[];
  label: string;
  to: string;
  /** A ação que o item exige (padrão: visualizar); telas de gestão exigem a de criar. */
  action?: PermissionActionName;
  /** Exige acesso a todos os registros do módulo (telas que só a administração usa). */
  fullScope?: boolean;
}

// Cada ticket futuro que adicionar uma tela real ganha sua própria entrada
// aqui — a lista cresce com o produto, o filtro por permissão não muda. Um
// item fica visível se o usuário tem a ação exigida (VIEW, por padrão) em pelo
// menos um dos módulos listados (ex.: "Usuários e perfis" cobre USUARIOS e
// PERFIS_DE_ACESSO), e o escopo total quando o item o pede.
export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { modules: [Module.DASHBOARD], label: "Dashboard", to: "/dashboard" },
  {
    modules: [Module.USUARIOS, Module.PERFIS_DE_ACESSO],
    label: "Usuários e perfis",
    to: "/usuarios",
  },
  { modules: [Module.OCORRENCIAS], label: "Agenda", to: "/agenda-administrativa" },
  { modules: [Module.PRESENCA], label: "Minhas aulas", to: "/minhas-aulas" },
  { modules: [Module.PLANOS], label: "Planos", to: "/planos" },
  { modules: [Module.GAMIFICACAO], label: "Metas", to: "/metas" },
  {
    modules: [Module.CLIENTES],
    label: "Atribuições",
    to: "/atribuicoes",
    action: PermissionAction.CREATE,
    fullScope: true,
  },
  {
    modules: [Module.TEMPLATES_DE_AULA],
    label: "Templates & modalidades",
    to: "/templates-e-modalidades",
  },
];

/** Telas do cliente com uma equivalente na área administrativa. */
const ADMIN_EQUIVALENT: Record<string, string> = { "/agenda": "/agenda-administrativa" };

function canAccess(user: CurrentUser, item: AdminMenuItem): boolean {
  const action = item.action ?? PermissionAction.VIEW;
  return item.modules.some((module) => {
    const permission = user.permissions.find((candidate) => candidate.module === module);
    if (!permission?.actions.includes(action)) return false;
    return !item.fullScope || permission.scope === PermissionScope.ALL;
  });
}

export function visibleAdminMenuItems(user: CurrentUser): AdminMenuItem[] {
  return ADMIN_MENU_ITEMS.filter((item) => canAccess(user, item));
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
  return item && canAccess(user, item) ? item.to : homeRouteFor(user);
}

/**
 * A rota administrativa pode ser aberta por este usuário? Só as telas do menu
 * têm regra própria (a permissão do item); as demais (ex.: a Presença de uma
 * aula) deixam a decisão para a API.
 */
export function canOpenAdminRoute(user: CurrentUser, path: string): boolean {
  const item = ADMIN_MENU_ITEMS.find((candidate) => candidate.to === path);
  return !item || canAccess(user, item);
}
