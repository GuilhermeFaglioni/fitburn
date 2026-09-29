import { Module } from "@nestjs/common";
import { GamificationModule } from "../gamification/gamification.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";

@Module({
  imports: [PermissionsModule, GamificationModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
