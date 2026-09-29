import { Module } from "@nestjs/common";
import { GamificationModule } from "../gamification/gamification.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { GoalsController } from "./goals.controller.js";
import { GoalsService } from "./goals.service.js";

@Module({
  imports: [PermissionsModule, GamificationModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
