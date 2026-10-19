import { Injectable } from "@nestjs/common";
import { HealthStatus, type HealthLivenessResponse, type HealthResponse } from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

const DATABASE_HEALTH_CHECK_TIMEOUT_MS = 1_000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  liveness(): HealthLivenessResponse {
    return {
      status: HealthStatus.OK,
      timestamp: new Date().toISOString(),
    };
  }

  async check(): Promise<HealthResponse> {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Database health check timed out")),
            DATABASE_HEALTH_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return {
        status: HealthStatus.OK,
        database: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: HealthStatus.ERROR,
        database: "disconnected",
        timestamp: new Date().toISOString(),
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
