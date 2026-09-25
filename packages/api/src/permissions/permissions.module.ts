import { Module } from "@nestjs/common";
import { PermissionsService } from "./permissions.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
