import { z } from "zod";
import {
  clientSummarySchema,
  workoutSheetSchema,
  type ClientSummary,
  type CreateWorkoutSheetRequest,
  type UpdateWorkoutSheetRequest,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function listWorkoutSheetClients(): Promise<ClientSummary[]> {
  const response = await authFetch("/api/workout-sheets/clients");
  return z.array(clientSummarySchema).parse(await parseOrThrow(response));
}

export async function listWorkoutSheets(clientId: string): Promise<WorkoutSheet[]> {
  const params = new URLSearchParams({ clientId });
  const response = await authFetch(`/api/workout-sheets?${params.toString()}`);
  return z.array(workoutSheetSchema).parse(await parseOrThrow(response));
}

export async function createWorkoutSheet(input: CreateWorkoutSheetRequest): Promise<WorkoutSheet> {
  const response = await authFetch("/api/workout-sheets", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return workoutSheetSchema.parse(await parseOrThrow(response));
}

export async function updateWorkoutSheet(
  id: string,
  input: UpdateWorkoutSheetRequest,
): Promise<WorkoutSheet> {
  const response = await authFetch(`/api/workout-sheets/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return workoutSheetSchema.parse(await parseOrThrow(response));
}

export async function listMyWorkoutSheets(): Promise<WorkoutSheet[]> {
  const response = await authFetch("/api/workout-sheets/mine");
  return z.array(workoutSheetSchema).parse(await parseOrThrow(response));
}

export async function getMyWorkoutSheet(id: string): Promise<WorkoutSheet> {
  const response = await authFetch(`/api/workout-sheets/mine/${encodeURIComponent(id)}`);
  return workoutSheetSchema.parse(await parseOrThrow(response));
}
