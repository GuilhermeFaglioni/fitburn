import type { ModuleName, PermissionActionName, PermissionScopeName } from "@fitburn/contracts";

export const MODULE_LABELS: Record<ModuleName, string> = {
  USUARIOS: "Usuários",
  PERFIS_DE_ACESSO: "Perfis de acesso",
  DASHBOARD: "Dashboard",
  TEMPLATES_DE_AULA: "Templates de aula",
  OCORRENCIAS: "Agenda",
  RESERVAS: "Reservas",
  CLIENTES: "Clientes",
  PLANOS: "Planos",
  PRESENCA: "Presença",
  FICHAS_DE_TREINO: "Fichas de treino",
  GAMIFICACAO: "Metas",
};

export const ACTION_LABELS: Record<PermissionActionName, string> = {
  VIEW: "Ver",
  CREATE: "Criar",
  EDIT: "Editar",
  DELETE: "Excluir",
  EXECUTE: "Executar",
};

export const SCOPE_LABELS: Record<PermissionScopeName, string> = {
  ALL: "Todos os registros",
  ASSIGNED_CLIENTS: "Clientes atribuídos",
  ASSIGNED_CLASSES: "Aulas atribuídas",
  OWN: "Registros próprios",
};
