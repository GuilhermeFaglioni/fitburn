import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { AdminReservationsController } from "./admin-reservations.controller.js";
import { AdminReservationsService } from "./admin-reservations.service.js";
import { ReservationsController } from "./reservations.controller.js";
import { ReservationsService } from "./reservations.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [ReservationsController, AdminReservationsController],
  providers: [ReservationsService, AdminReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
