import { z } from "zod";
import {
  clientListItemSchema,
  clientOverviewSchema,
  clientUserResponseSchema,
  userDetailSchema,
  type ClientListItem,
  type ClientOverview,
  type ClientUserResponse,
  type ClientsQuery,
  type CreateClientRequest,
  type UpdateClientRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function listClients(query: ClientsQuery = {}): Promise<ClientListItem[]> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const suffix = params.toString();

  const response = await authFetch(`/api/clients${suffix ? `?${suffix}` : ""}`);
  return z.array(clientListItemSchema).parse(await parseOrThrow(response));
}

export async function getClientOverview(id: string): Promise<ClientOverview> {
  const response = await authFetch(`/api/clients/${id}`);
  return clientOverviewSchema.parse(await parseOrThrow(response));
}

export async function createClientRecord(input: CreateClientRequest): Promise<UserDetail> {
  const response = await authFetch("/api/clients", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return userDetailSchema.parse(await parseOrThrow(response));
}

export async function updateClientRecord(
  id: string,
  input: UpdateClientRequest,
): Promise<ClientUserResponse> {
  const response = await authFetch(`/api/clients/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return clientUserResponseSchema.parse(await parseOrThrow(response));
}

export async function setClientActive(id: string, active: boolean): Promise<ClientUserResponse> {
  const response = await authFetch(`/api/clients/${id}/${active ? "reactivate" : "deactivate"}`, {
    method: "POST",
  });
  return clientUserResponseSchema.parse(await parseOrThrow(response));
}

/** Exclusão com anonimização (irreversível). */
export async function deleteClientRecord(id: string): Promise<ClientUserResponse> {
  const response = await authFetch(`/api/clients/${id}`, { method: "DELETE" });
  return clientUserResponseSchema.parse(await parseOrThrow(response));
}
