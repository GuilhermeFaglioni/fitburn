import { z } from "zod";
import {
  occurrenceDetailSchema,
  occurrenceFormOptionsSchema,
  type CreateOccurrenceRequest,
  type OccurrenceDetail,
  type OccurrenceFormOptions,
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
