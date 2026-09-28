import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import {
  createReservationRequestSchema,
  type CreateReservationRequest,
  type ReservationDetail,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { IdempotencyKey } from "./idempotency-key.decorator.js";
import { ReservationsService } from "./reservations.service.js";

/**
 * Reservas do próprio usuário logado (autoatendimento do cliente): o dono
 * da reserva é sempre quem está autenticado, então o escopo é "OWN" por
 * construção. Reservas feitas pela equipe em nome de um cliente usam o
 * módulo RESERVAS (reservas administrativas, #44).
 */
@Controller("reservations")
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createReservationRequestSchema)) body: CreateReservationRequest,
    @IdempotencyKey() idempotencyKey: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReservationDetail> {
    return this.reservationsService.create(req.authUser.sub, body, idempotencyKey);
  }
}
