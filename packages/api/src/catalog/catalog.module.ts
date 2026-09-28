import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { ClassTemplatesController } from "./class-templates.controller.js";
import { ClassTemplatesService } from "./class-templates.service.js";
import { InstructorsService } from "./instructors.service.js";
import { ModalitiesController } from "./modalities.controller.js";
import { ModalitiesService } from "./modalities.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [ModalitiesController, ClassTemplatesController],
  providers: [ModalitiesService, ClassTemplatesService, InstructorsService],
})
export class CatalogModule {}
