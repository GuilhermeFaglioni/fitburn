import {
  gamificationSummarySchema,
  rankingSchema,
  type GamificationSummary,
  type Ranking,
  type RankingPeriodName,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function getMyGamification(): Promise<GamificationSummary> {
  const response = await authFetch("/api/gamification/me");
  return gamificationSummarySchema.parse(await parseOrThrow(response));
}

export async function getRanking(period: RankingPeriodName): Promise<Ranking> {
  const params = new URLSearchParams({ period });
  const response = await authFetch(`/api/gamification/ranking?${params.toString()}`);
  return rankingSchema.parse(await parseOrThrow(response));
}
