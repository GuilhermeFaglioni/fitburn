import { healthResponseSchema, type HealthResponse } from "@fitburn/contracts";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Falha ao consultar o status da API (${response.status})`);
  }
  const data = await response.json();
  return healthResponseSchema.parse(data);
}
