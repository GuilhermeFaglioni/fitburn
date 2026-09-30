import { z } from "zod";
import {
  userDetailSchema,
  type CreateClientRequest,
  type CreateStaffRequest,
  type UpdateUserRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function listUsers(
  filters: { profileId?: string; status?: string } = {},
): Promise<UserDetail[]> {
  const params = new URLSearchParams();
  if (filters.profileId) params.set("profileId", filters.profileId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();

  const response = await authFetch(`/api/users${query ? `?${query}` : ""}`);
  return z.array(userDetailSchema).parse(await parseOrThrow(response));
}

export async function createClient(input: CreateClientRequest): Promise<UserDetail> {
  const response = await authFetch("/api/users/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return userDetailSchema.parse(await parseOrThrow(response));
}

export async function deactivateUser(id: string): Promise<UserDetail> {
  const response = await authFetch(`/api/users/${id}/deactivate`, { method: "POST" });
  return userDetailSchema.parse(await parseOrThrow(response));
}

export async function reactivateUser(id: string): Promise<UserDetail> {
  const response = await authFetch(`/api/users/${id}/reactivate`, { method: "POST" });
  return userDetailSchema.parse(await parseOrThrow(response));
}

/** Exclusão com anonimização (irreversível) de qualquer usuário. */
export async function deleteUser(id: string): Promise<UserDetail> {
  const response = await authFetch(`/api/users/${id}`, { method: "DELETE" });
  return userDetailSchema.parse(await parseOrThrow(response));
}

export async function createStaff(input: CreateStaffRequest): Promise<UserDetail> {
  const response = await authFetch("/api/users/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return userDetailSchema.parse(await parseOrThrow(response));
}

export async function updateUser(id: string, input: UpdateUserRequest): Promise<UserDetail> {
  const response = await authFetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return userDetailSchema.parse(await parseOrThrow(response));
}
