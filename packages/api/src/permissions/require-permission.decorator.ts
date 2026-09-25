import { SetMetadata } from "@nestjs/common";
import type { ModuleName, PermissionActionName } from "@fitburn/contracts";

export const PERMISSION_METADATA_KEY = "requiredPermission";

export interface RequiredPermission {
  module: ModuleName;
  action: PermissionActionName;
}

export const RequirePermission = (module: ModuleName, action: PermissionActionName) =>
  SetMetadata(PERMISSION_METADATA_KEY, { module, action } satisfies RequiredPermission);
