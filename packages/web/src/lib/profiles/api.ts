import { z } from "zod";
import {
  moduleCatalogSchema,
  profileDetailSchema,
  type CreateProfileRequest,
  type ModuleCatalog,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
  type ProfileDetail,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function getCatalog(): Promise<ModuleCatalog> {
  const response = await authFetch("/api/profiles/catalog");
  return moduleCatalogSchema.parse(await parseOrThrow(response));
}

export async function listProfiles(): Promise<ProfileDetail[]> {
  const response = await authFetch("/api/profiles");
  return z.array(profileDetailSchema).parse(await parseOrThrow(response));
}

export async function createProfile(input: CreateProfileRequest): Promise<ProfileDetail> {
  const response = await authFetch("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return profileDetailSchema.parse(await parseOrThrow(response));
}

export async function setModuleAccess(
  profileId: string,
  module: ModuleName,
  actions: PermissionActionName[],
  scope: PermissionScopeName,
): Promise<ProfileDetail> {
  const response = await authFetch(`/api/profiles/${profileId}/module-access/${module}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions, scope }),
  });
  return profileDetailSchema.parse(await parseOrThrow(response));
}

export async function deactivateProfile(id: string): Promise<ProfileDetail> {
  const response = await authFetch(`/api/profiles/${id}/deactivate`, { method: "POST" });
  return profileDetailSchema.parse(await parseOrThrow(response));
}

export async function activateProfile(id: string): Promise<ProfileDetail> {
  const response = await authFetch(`/api/profiles/${id}/activate`, { method: "POST" });
  return profileDetailSchema.parse(await parseOrThrow(response));
}
