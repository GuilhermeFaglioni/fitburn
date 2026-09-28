import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { OccurrencesController } from "./occurrences.controller.js";
import { OccurrencesService } from "./occurrences.service.js";

@Module({
  imports: [PermissionsModule, CatalogModule],
  controllers: [OccurrencesController],
  providers: [OccurrencesService],
})
export class AgendaModule {}
