import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { PlanAssignmentsController, PlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [PlansController, PlanAssignmentsController],
  providers: [PlansService],
})
export class PlansModule {}
