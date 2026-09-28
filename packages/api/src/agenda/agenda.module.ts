import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module.js";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { ClientAgendaController } from "./client-agenda.controller.js";
import { ClientAgendaService } from "./client-agenda.service.js";
import { OccurrencesController } from "./occurrences.controller.js";
import { OccurrencesService } from "./occurrences.service.js";

@Module({
  imports: [PermissionsModule, CatalogModule],
  controllers: [OccurrencesController, ClientAgendaController],
  providers: [OccurrencesService, ClientAgendaService],
})
export class AgendaModule {}
