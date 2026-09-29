import { z } from "zod";
import {
  assignmentOptionsSchema,
  assignmentSchema,
  type Assignment,
  type AssignmentOptions,
  type CreateAssignmentRequest,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function listAssignments(teacherId: string): Promise<Assignment[]> {
  const params = new URLSearchParams({ teacherId });
  const response = await authFetch(`/api/assignments?${params.toString()}`);
  return z.array(assignmentSchema).parse(await parseOrThrow(response));
}

export async function getAssignmentOptions(): Promise<AssignmentOptions> {
  const response = await authFetch("/api/assignments/options");
  return assignmentOptionsSchema.parse(await parseOrThrow(response));
}

export async function createAssignment(input: CreateAssignmentRequest): Promise<Assignment> {
  const response = await authFetch("/api/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return assignmentSchema.parse(await parseOrThrow(response));
}

export async function deleteAssignment(id: string): Promise<void> {
  const response = await authFetch(`/api/assignments/${id}`, { method: "DELETE" });
  await parseOrThrow(response);
}
