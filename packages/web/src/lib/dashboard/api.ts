import { dashboardSchema, type Dashboard, type RankingPeriodName } from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function getDashboard(period: RankingPeriodName): Promise<Dashboard> {
  const params = new URLSearchParams({ period });
  const response = await authFetch(`/api/dashboard?${params.toString()}`);
  return dashboardSchema.parse(await parseOrThrow(response));
}
