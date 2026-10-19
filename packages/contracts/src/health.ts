import { z } from "zod";

export const HealthStatus = {
  OK: "ok",
  ERROR: "error",
} as const;

export const healthResponseSchema = z.object({
  status: z.enum([HealthStatus.OK, HealthStatus.ERROR]),
  database: z.enum(["connected", "disconnected"]),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const healthLivenessResponseSchema = z.object({
  status: z.literal(HealthStatus.OK),
  timestamp: z.string(),
});

export type HealthLivenessResponse = z.infer<typeof healthLivenessResponseSchema>;
