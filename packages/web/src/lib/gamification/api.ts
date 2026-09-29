import { gamificationSummarySchema, type GamificationSummary } from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function getMyGamification(): Promise<GamificationSummary> {
  const response = await authFetch("/api/gamification/me");
  return gamificationSummarySchema.parse(await parseOrThrow(response));
}
