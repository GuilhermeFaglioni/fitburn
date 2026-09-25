import { http, HttpResponse } from "msw";
import type { HealthResponse } from "@fitburn/contracts";

export const healthyResponse: HealthResponse = {
  status: "ok",
  database: "connected",
  timestamp: new Date().toISOString(),
};

export const handlers = [http.get("/api/health", () => HttpResponse.json(healthyResponse))];
