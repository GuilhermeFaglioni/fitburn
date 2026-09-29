import { z } from "zod";
import {
  clientSummarySchema,
  goalDetailSchema,
  type ClientSummary,
  type CreateGoalRequest,
  type GoalDetail,
  type UpdateGoalRequest,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function listGoalClients(): Promise<ClientSummary[]> {
  const response = await authFetch("/api/goals/clients");
  return z.array(clientSummarySchema).parse(await parseOrThrow(response));
}

export async function listGoals(clientId: string): Promise<GoalDetail[]> {
  const params = new URLSearchParams({ clientId });
  const response = await authFetch(`/api/goals?${params.toString()}`);
  return z.array(goalDetailSchema).parse(await parseOrThrow(response));
}

export async function listMyGoals(): Promise<GoalDetail[]> {
  const response = await authFetch("/api/goals/mine");
  return z.array(goalDetailSchema).parse(await parseOrThrow(response));
}

export async function createGoal(input: CreateGoalRequest): Promise<GoalDetail> {
  const response = await authFetch("/api/goals", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return goalDetailSchema.parse(await parseOrThrow(response));
}

export async function updateGoal(id: string, input: UpdateGoalRequest): Promise<GoalDetail> {
  const response = await authFetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return goalDetailSchema.parse(await parseOrThrow(response));
}

export async function completeGoal(id: string): Promise<GoalDetail> {
  const response = await authFetch(`/api/goals/${id}/complete`, { method: "POST" });
  return goalDetailSchema.parse(await parseOrThrow(response));
}

export async function cancelGoal(id: string): Promise<GoalDetail> {
  const response = await authFetch(`/api/goals/${id}/cancel`, { method: "POST" });
  return goalDetailSchema.parse(await parseOrThrow(response));
}
