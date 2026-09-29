import { Module } from "@nestjs/common";
import { GamificationModule } from "../gamification/gamification.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [PermissionsModule, GamificationModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
