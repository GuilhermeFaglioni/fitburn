import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthModule } from "./auth/jwt-auth.module.js";
import { UsersModule } from "./users/users.module.js";
import { PermissionsModule } from "./permissions/permissions.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { AgendaModule } from "./agenda/agenda.module.js";
import { ReservationsModule } from "./reservations/reservations.module.js";
import { AttendanceModule } from "./attendance/attendance.module.js";
import { GamificationModule } from "./gamification/gamification.module.js";
import { AssignmentsModule } from "./assignments/assignments.module.js";
import { GoalsModule } from "./goals/goals.module.js";
import { PlansModule } from "./plans/plans.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { WorkoutSheetsModule } from "./workout-sheets/workout-sheets.module.js";
import { ClientsModule } from "./clients/clients.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: "../../.env" }),
    PrismaModule,
    JwtAuthModule,
    HealthModule,
    PermissionsModule,
    UsersModule,
    ProfilesModule,
    CatalogModule,
    AgendaModule,
    ReservationsModule,
    AttendanceModule,
    GamificationModule,
    AssignmentsModule,
    GoalsModule,
    PlansModule,
    WorkoutSheetsModule,
    ClientsModule,
    DashboardModule,
    AuthModule,
  ],
})
export class AppModule {}
