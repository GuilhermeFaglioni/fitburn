import {
  bioimpedanceConsentResponseSchema,
  type BioimpedanceConsentResponse,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export const bioimpedanceConsentQueryKey = ["bioimpedance", "consent"] as const;

export async function getBioimpedanceConsent(): Promise<BioimpedanceConsentResponse> {
  const response = await authFetch("/api/bioimpedance/consent");
  return bioimpedanceConsentResponseSchema.parse(await parseOrThrow(response));
}

export async function setBioimpedanceConsent(
  consented: boolean,
): Promise<BioimpedanceConsentResponse> {
  const response = await authFetch("/api/bioimpedance/consent", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consented }),
  });
  return bioimpedanceConsentResponseSchema.parse(await parseOrThrow(response));
}
