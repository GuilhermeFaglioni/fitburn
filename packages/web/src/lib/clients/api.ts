import { z } from "zod";
import {
  clientDetailSchema,
  clientListItemSchema,
  clientPlanSchema,
  gamificationSummarySchema,
  reservationDetailSchema,
  workoutSheetSchema,
  type ClientDetail,
  type ClientListItem,
  type ClientPlan,
  type ClientsQuery,
  type CreateClientRequest,
  type GamificationSummary,
  type MyReservationsQuery,
  type ReservationDetail,
  type UpdateClientRequest,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

const base = (clientId: string) => `/api/clients/${encodeURIComponent(clientId)}`;

export async function listClients(filters: ClientsQuery = {}): Promise<ClientListItem[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  const response = await authFetch(`/api/clients${query ? `?${query}` : ""}`);
  return z.array(clientListItemSchema).parse(await parseOrThrow(response));
}

export async function getClient(clientId: string): Promise<ClientDetail> {
  const response = await authFetch(base(clientId));
  return clientDetailSchema.parse(await parseOrThrow(response));
}

export async function createClient(input: CreateClientRequest): Promise<ClientDetail> {
  const response = await authFetch("/api/clients", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return clientDetailSchema.parse(await parseOrThrow(response));
}

export async function updateClient(
  clientId: string,
  input: UpdateClientRequest,
): Promise<ClientDetail> {
  const response = await authFetch(base(clientId), {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return clientDetailSchema.parse(await parseOrThrow(response));
}

export async function deactivateClient(clientId: string): Promise<ClientDetail> {
  const response = await authFetch(`${base(clientId)}/deactivate`, { method: "POST" });
  return clientDetailSchema.parse(await parseOrThrow(response));
}

export async function reactivateClient(clientId: string): Promise<ClientDetail> {
  const response = await authFetch(`${base(clientId)}/reactivate`, { method: "POST" });
  return clientDetailSchema.parse(await parseOrThrow(response));
}

export async function getClientPlan(clientId: string): Promise<ClientPlan> {
  const response = await authFetch(`${base(clientId)}/plan`);
  return clientPlanSchema.parse(await parseOrThrow(response));
}

export async function listClientReservations(
  clientId: string,
  query: MyReservationsQuery,
): Promise<ReservationDetail[]> {
  const params = new URLSearchParams({ when: query.when });
  if (query.status) params.set("status", query.status);
  const response = await authFetch(`${base(clientId)}/reservations?${params.toString()}`);
  return z.array(reservationDetailSchema).parse(await parseOrThrow(response));
}

export async function getClientGamification(clientId: string): Promise<GamificationSummary> {
  const response = await authFetch(`${base(clientId)}/gamification`);
  return gamificationSummarySchema.parse(await parseOrThrow(response));
}

export async function listClientWorkoutSheets(clientId: string): Promise<WorkoutSheet[]> {
  const response = await authFetch(`${base(clientId)}/workout-sheets`);
  return z.array(workoutSheetSchema).parse(await parseOrThrow(response));
}
