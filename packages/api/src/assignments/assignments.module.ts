import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { AssignmentsController } from "./assignments.controller.js";
import { AssignmentsService } from "./assignments.service.js";

@Module({
  imports: [PermissionsModule, CatalogModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
