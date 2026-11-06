import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { OccupancyExportController } from "./occupancy-export.controller.js";
import { OccupancyExportService } from "./occupancy-export.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [OccupancyExportController],
  providers: [OccupancyExportService],
})
export class ExportsModule {}
