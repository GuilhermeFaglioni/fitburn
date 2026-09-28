import { z } from "zod";
import {
  occurrenceDetailSchema,
  occurrenceFormOptionsSchema,
  recurringOccurrencesResultSchema,
  type CreateOccurrenceRequest,
  type CreateRecurringOccurrencesRequest,
  type OccurrenceDetail,
  type OccurrenceFormOptions,
  type RecurringOccurrencesResult,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function listOccurrences(from: string, to: string): Promise<OccurrenceDetail[]> {
  const params = new URLSearchParams({ from, to });
  const response = await authFetch(`/api/occurrences?${params.toString()}`);
  return z.array(occurrenceDetailSchema).parse(await parseOrThrow(response));
}

export async function getOccurrenceFormOptions(): Promise<OccurrenceFormOptions> {
  const response = await authFetch("/api/occurrences/options");
  return occurrenceFormOptionsSchema.parse(await parseOrThrow(response));
}

export async function createOccurrence(input: CreateOccurrenceRequest): Promise<OccurrenceDetail> {
  const response = await authFetch("/api/occurrences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return occurrenceDetailSchema.parse(await parseOrThrow(response));
}

export async function createRecurringOccurrences(
  input: CreateRecurringOccurrencesRequest,
): Promise<RecurringOccurrencesResult> {
  const response = await authFetch("/api/occurrences/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return recurringOccurrencesResultSchema.parse(await parseOrThrow(response));
}
