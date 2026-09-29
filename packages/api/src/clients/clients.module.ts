import { Module } from "@nestjs/common";
import { GamificationModule } from "../gamification/gamification.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { ReservationsModule } from "../reservations/reservations.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutSheetsModule } from "../workout-sheets/workout-sheets.module.js";
import { ClientsController } from "./clients.controller.js";
import { ClientsService } from "./clients.service.js";

@Module({
  imports: [
    PermissionsModule,
    UsersModule,
    PlansModule,
    ReservationsModule,
    GamificationModule,
    WorkoutSheetsModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
