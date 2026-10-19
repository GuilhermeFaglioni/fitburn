import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { HealthStatus, type HealthLivenessResponse, type HealthResponse } from "@fitburn/contracts";
import type { Response } from "express";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  liveness(): HealthLivenessResponse {
    return this.healthService.liveness();
  }

  @Get(["", "ready"])
  async readiness(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const health = await this.healthService.check();
    response.status(
      health.status === HealthStatus.OK ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return health;
  }
}
