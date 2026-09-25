import { Injectable } from "@nestjs/common";
import { HealthStatus, type HealthResponse } from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
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
    }
  }
}
