import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { PlanAssignmentsController } from "./plan-assignments.controller.js";
import { PlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [PlansController, PlanAssignmentsController],
  providers: [PlansService],
})
export class PlansModule {}
