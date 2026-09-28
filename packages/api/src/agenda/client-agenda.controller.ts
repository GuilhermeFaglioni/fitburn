import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  dateRangeQuerySchema,
  type ClientAgendaItem,
  type DateRangeQuery,
} from "@fitburn/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { ClientAgendaService } from "./client-agenda.service.js";

/**
 * Leitura aberta a qualquer usuário logado: a agenda pública da academia
 * (clientes e equipe). Criar ou alterar aulas é que exige o módulo
 * "ocorrências/agendamento" (OccurrencesController).
 */
@Controller("agenda")
@UseGuards(JwtAuthGuard)
export class ClientAgendaController {
  constructor(private readonly agendaService: ClientAgendaService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(dateRangeQuerySchema)) query: DateRangeQuery,
  ): Promise<ClientAgendaItem[]> {
    return this.agendaService.list(query.from, query.to);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<ClientAgendaItem> {
    return this.agendaService.findOne(id);
  }
}
