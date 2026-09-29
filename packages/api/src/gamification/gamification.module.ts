import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { GamificationController } from "./gamification.controller.js";
import { GamificationService } from "./gamification.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
