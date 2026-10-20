import {
  gamificationSummarySchema,
  rankingConsentResponseSchema,
  rankingSchema,
  type GamificationSummary,
  type RankingConsentResponse,
  type Ranking,
  type RankingPeriodName,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export const rankingConsentQueryKey = ["gamification", "ranking-consent"] as const;

export async function getMyGamification(): Promise<GamificationSummary> {
  const response = await authFetch("/api/gamification/me");
  return gamificationSummarySchema.parse(await parseOrThrow(response));
}

export async function getRanking(period: RankingPeriodName): Promise<Ranking> {
  const params = new URLSearchParams({ period });
  const response = await authFetch(`/api/gamification/ranking?${params.toString()}`);
  return rankingSchema.parse(await parseOrThrow(response));
}

export async function getRankingConsent(): Promise<RankingConsentResponse> {
  const response = await authFetch("/api/gamification/ranking/consent");
  return rankingConsentResponseSchema.parse(await parseOrThrow(response));
}

export async function setRankingConsent(consented: boolean): Promise<RankingConsentResponse> {
  const response = await authFetch("/api/gamification/ranking/consent", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consented }),
  });
  return rankingConsentResponseSchema.parse(await parseOrThrow(response));
}
