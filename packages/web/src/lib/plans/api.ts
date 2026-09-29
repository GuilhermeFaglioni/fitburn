import { z } from "zod";
import {
  myPlanSchema,
  planAssignmentOptionsSchema,
  planAssignmentSchema,
  planDetailSchema,
  type AssignPlanRequest,
  type CreatePlanRequest,
  type MyPlan,
  type PlanAssignment,
  type PlanAssignmentOptions,
  type PlanDetail,
  type UpdatePlanRequest,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getMyPlan(): Promise<MyPlan> {
  const response = await authFetch("/api/plans/mine");
  return myPlanSchema.parse(await parseOrThrow(response));
}

export async function listPlans(): Promise<PlanDetail[]> {
  const response = await authFetch("/api/plans");
  return z.array(planDetailSchema).parse(await parseOrThrow(response));
}

export async function createPlan(input: CreatePlanRequest): Promise<PlanDetail> {
  const response = await authFetch("/api/plans", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return planDetailSchema.parse(await parseOrThrow(response));
}

export async function updatePlan(id: string, input: UpdatePlanRequest): Promise<PlanDetail> {
  const response = await authFetch(`/api/plans/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return planDetailSchema.parse(await parseOrThrow(response));
}

export async function setPlanActive(id: string, isActive: boolean): Promise<PlanDetail> {
  const response = await authFetch(`/api/plans/${id}/${isActive ? "activate" : "deactivate"}`, {
    method: "POST",
  });
  return planDetailSchema.parse(await parseOrThrow(response));
}

export async function getPlanAssignmentOptions(): Promise<PlanAssignmentOptions> {
  const response = await authFetch("/api/plans/options");
  return planAssignmentOptionsSchema.parse(await parseOrThrow(response));
}

export async function assignPlan(input: AssignPlanRequest): Promise<PlanAssignment> {
  const response = await authFetch("/api/plan-assignments", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return planAssignmentSchema.parse(await parseOrThrow(response));
}

export async function listClientPlans(clientId: string): Promise<PlanAssignment[]> {
  const params = new URLSearchParams({ clientId });
  const response = await authFetch(`/api/plan-assignments?${params.toString()}`);
  return z.array(planAssignmentSchema).parse(await parseOrThrow(response));
}
