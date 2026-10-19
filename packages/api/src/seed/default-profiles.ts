import type { Module, PermissionAction, PermissionScope } from "@prisma/client";

type DefaultProfileAccess = {
  module: Module;
  actions: readonly PermissionAction[];
  scope: PermissionScope;
};

type DefaultStaffProfile = {
  name: string;
  description: string;
  access: readonly DefaultProfileAccess[];
};

/** Matriz padrão do Professor, compartilhada pelo seed base e pela demonstração. */
export const PROFESSOR_PROFILE = {
  name: "Professor",
  description: "Conduz aulas, registra presença e acompanha os próprios alunos.",
  access: [
    { module: "DASHBOARD", actions: ["VIEW"], scope: "ALL" },
    { module: "TEMPLATES_DE_AULA", actions: ["VIEW"], scope: "ALL" },
    {
      module: "OCORRENCIAS",
      actions: ["VIEW", "CREATE", "EDIT"],
      scope: "ASSIGNED_CLASSES",
    },
    { module: "PRESENCA", actions: ["VIEW", "EXECUTE"], scope: "ASSIGNED_CLASSES" },
    { module: "CLIENTES", actions: ["VIEW"], scope: "ASSIGNED_CLIENTS" },
    {
      module: "FICHAS_DE_TREINO",
      actions: ["VIEW", "CREATE", "EDIT"],
      scope: "ASSIGNED_CLIENTS",
    },
    {
      module: "GAMIFICACAO",
      actions: ["VIEW", "CREATE", "EDIT"],
      scope: "ASSIGNED_CLIENTS",
    },
  ],
} as const satisfies DefaultStaffProfile;

/** Matriz mínima da recepção; não concede gestão nem atribuição de perfis de equipe. */
export const ADMINISTRATIVE_EMPLOYEE_PROFILE = {
  name: "Funcionário administrativo",
  description: "Recepção: reservas, clientes e planos.",
  access: [
    { module: "DASHBOARD", actions: ["VIEW"], scope: "ALL" },
    { module: "TEMPLATES_DE_AULA", actions: ["VIEW"], scope: "ALL" },
    { module: "OCORRENCIAS", actions: ["VIEW"], scope: "ALL" },
    { module: "RESERVAS", actions: ["VIEW", "CREATE", "EDIT"], scope: "ALL" },
    { module: "CLIENTES", actions: ["VIEW", "CREATE", "EDIT"], scope: "ALL" },
    { module: "PLANOS", actions: ["VIEW", "CREATE", "EDIT"], scope: "ALL" },
    { module: "GAMIFICACAO", actions: ["VIEW"], scope: "ALL" },
  ],
} as const satisfies DefaultStaffProfile;

export const DEFAULT_STAFF_PROFILES = [PROFESSOR_PROFILE, ADMINISTRATIVE_EMPLOYEE_PROFILE] as const;
