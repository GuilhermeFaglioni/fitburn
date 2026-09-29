import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { WorkoutSheetsController } from "./workout-sheets.controller.js";
import { WorkoutSheetsService } from "./workout-sheets.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [WorkoutSheetsController],
  providers: [WorkoutSheetsService],
  exports: [WorkoutSheetsService],
})
export class WorkoutSheetsModule {}
