import { z } from "zod";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  effectivePermissionSchema,
  PermissionScope,
  type ModuleName,
  type PermissionActionName,
} from "./permissions.js";

export const createProfileRequestSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  description: z.string().trim().min(1).optional(),
});
export type CreateProfileRequest = z.infer<typeof createProfileRequestSchema>;

export const updateProfileRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

const moduleEnum = z.enum(ALL_MODULES as [ModuleName, ...ModuleName[]]);
const actionEnum = z.enum(ALL_PERMISSION_ACTIONS as [PermissionActionName, ...PermissionActionName[]]);
const scopeEnum = z.enum([
  PermissionScope.ALL,
  PermissionScope.ASSIGNED_CLIENTS,
  PermissionScope.ASSIGNED_CLASSES,
  PermissionScope.OWN,
]);

export const setModuleAccessRequestSchema = z.object({
  actions: z.array(actionEnum),
  scope: scopeEnum,
});
export type SetModuleAccessRequest = z.infer<typeof setModuleAccessRequestSchema>;

export const profileDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  moduleAccess: z.array(effectivePermissionSchema),
});
export type ProfileDetail = z.infer<typeof profileDetailSchema>;

export const moduleCatalogSchema = z.object({
  modules: z.array(moduleEnum),
  actions: z.array(actionEnum),
  scopes: z.array(scopeEnum),
});
export type ModuleCatalog = z.infer<typeof moduleCatalogSchema>;

export const MODULE_CATALOG: ModuleCatalog = {
  modules: ALL_MODULES,
  actions: ALL_PERMISSION_ACTIONS,
  scopes: [
    PermissionScope.ALL,
    PermissionScope.ASSIGNED_CLIENTS,
    PermissionScope.ASSIGNED_CLASSES,
    PermissionScope.OWN,
  ],
};
