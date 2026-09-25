import { z } from "zod";

export const Module = {
  USUARIOS: "USUARIOS",
  PERFIS_DE_ACESSO: "PERFIS_DE_ACESSO",
  DASHBOARD: "DASHBOARD",
  TEMPLATES_DE_AULA: "TEMPLATES_DE_AULA",
  OCORRENCIAS: "OCORRENCIAS",
  RESERVAS: "RESERVAS",
  CLIENTES: "CLIENTES",
  PLANOS: "PLANOS",
  PRESENCA: "PRESENCA",
  FICHAS_DE_TREINO: "FICHAS_DE_TREINO",
  GAMIFICACAO: "GAMIFICACAO",
} as const;
export type ModuleName = (typeof Module)[keyof typeof Module];
export const ALL_MODULES = Object.values(Module) as ModuleName[];

export const PermissionAction = {
  VIEW: "VIEW",
  CREATE: "CREATE",
  EDIT: "EDIT",
  DELETE: "DELETE",
  EXECUTE: "EXECUTE",
} as const;
export type PermissionActionName = (typeof PermissionAction)[keyof typeof PermissionAction];
export const ALL_PERMISSION_ACTIONS = Object.values(PermissionAction) as PermissionActionName[];

export const PermissionScope = {
  ALL: "ALL",
  ASSIGNED_CLIENTS: "ASSIGNED_CLIENTS",
  ASSIGNED_CLASSES: "ASSIGNED_CLASSES",
  OWN: "OWN",
} as const;
export type PermissionScopeName = (typeof PermissionScope)[keyof typeof PermissionScope];

export const effectivePermissionSchema = z.object({
  module: z.enum(ALL_MODULES as [ModuleName, ...ModuleName[]]),
  actions: z.array(z.enum(ALL_PERMISSION_ACTIONS as [PermissionActionName, ...PermissionActionName[]])),
  scope: z.enum([
    PermissionScope.ALL,
    PermissionScope.ASSIGNED_CLIENTS,
    PermissionScope.ASSIGNED_CLASSES,
    PermissionScope.OWN,
  ]),
});
export type EffectivePermission = z.infer<typeof effectivePermissionSchema>;
