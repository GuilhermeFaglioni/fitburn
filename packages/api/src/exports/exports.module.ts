import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { AttendanceExportController } from "./attendance-export.controller.js";
import { AttendanceExportService } from "./attendance-export.service.js";
import { OccupancyExportController } from "./occupancy-export.controller.js";
import { OccupancyExportService } from "./occupancy-export.service.js";
import { ReservationsExportController } from "./reservations-export.controller.js";
import { ReservationsExportService } from "./reservations-export.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [
    OccupancyExportController,
    ReservationsExportController,
    AttendanceExportController,
  ],
  providers: [OccupancyExportService, ReservationsExportService, AttendanceExportService],
})
export class ExportsModule {}
