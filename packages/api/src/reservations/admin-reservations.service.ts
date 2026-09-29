import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  addDays,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
  ReservationActorKind,
  type AdminReservationDetail,
  type AdminReservationsQuery,
  type CreateAdminReservationRequest,
  type RescheduleReservationRequest,
  type ReservationActor,
  type ReservationPreview,
  type ReservationPreviewQuery,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { assertClientInScope, clientScopeFilter } from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { DETAIL_INCLUDE, toReservationDetail } from "./reservation-detail.js";
import { ReservationsService } from "./reservations.service.js";

const ACTOR_SELECT = { id: true, fullName: true } as const;

const ADMIN_INCLUDE = {
  ...DETAIL_INCLUDE,
  client: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: ACTOR_SELECT },
  cancelledBy: { select: ACTOR_SELECT },
} satisfies Prisma.ReservationInclude;

type AdminReservationRow = Prisma.ReservationGetPayload<{ include: typeof ADMIN_INCLUDE }>;

/**
 * Reservas administrativas: camada fina da equipe sobre o motor de reserva.
 * Cada operação só confere o escopo do cliente e delega ao mesmo motor
 * (mesmas regras, transação e idempotência), informando a equipe como autora.
 */
@Injectable()
export class AdminReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationsService: ReservationsService,
  ) {}

  async list(
    query: AdminReservationsQuery,
    requester: ScopedRequester,
  ): Promise<AdminReservationDetail[]> {
    if (query.clientId) await assertClientInScope(this.prisma, query.clientId, requester);
    if (query.occurrenceId) await this.assertOccurrenceExists(query.occurrenceId);

    const startsAt: Prisma.DateTimeFilter = {};
    if (query.from) startsAt.gte = gymDateTimeToUtc(query.from, "00:00");
    if (query.to) startsAt.lt = gymDateTimeToUtc(addDays(query.to, 1), "00:00");

    const reservations = await this.prisma.reservation.findMany({
      where: {
        client: clientScopeFilter(requester),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.occurrenceId ? { occurrenceId: query.occurrenceId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to ? { occurrence: { startsAt } } : {}),
      },
      include: ADMIN_INCLUDE,
      orderBy: [{ occurrence: { startsAt: "desc" } }, { createdAt: "asc" }, { id: "asc" }],
    });
    return reservations.map(toAdminDetail);
  }

  async preview(
    query: ReservationPreviewQuery,
    requester: ScopedRequester,
  ): Promise<ReservationPreview> {
    await assertClientInScope(this.prisma, query.clientId, requester);
    return this.reservationsService.preview(
      query.clientId,
      query.occurrenceId,
      query.replacingReservationId,
    );
  }

  async create(
    input: CreateAdminReservationRequest,
    idempotencyKey: string,
    requester: ScopedRequester,
  ): Promise<AdminReservationDetail> {
    await assertClientInScope(this.prisma, input.clientId, requester);
    const created = await this.reservationsService.create(
      input.clientId,
      { occurrenceId: input.occurrenceId },
      idempotencyKey,
      requester.userId,
    );
    return this.detailById(created.id);
  }

  async cancel(reservationId: string, requester: ScopedRequester): Promise<AdminReservationDetail> {
    const clientId = await this.scopedClientOf(reservationId, requester);
    await this.reservationsService.cancel(clientId, reservationId, requester.userId);
    return this.detailById(reservationId);
  }

  async reschedule(
    reservationId: string,
    input: RescheduleReservationRequest,
    idempotencyKey: string,
    requester: ScopedRequester,
  ): Promise<AdminReservationDetail> {
    const clientId = await this.scopedClientOf(reservationId, requester);
    const created = await this.reservationsService.reschedule(
      clientId,
      reservationId,
      input,
      idempotencyKey,
      requester.userId,
    );
    return this.detailById(created.id);
  }

  /** O cliente dono da reserva, conferido contra o escopo de quem pede (404 / 403). */
  private async scopedClientOf(reservationId: string, requester: ScopedRequester): Promise<string> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { clientId: true },
    });
    if (!reservation) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Reserva não encontrada.", ErrorStatus.NOT_FOUND);
    }
    await assertClientInScope(this.prisma, reservation.clientId, requester);
    return reservation.clientId;
  }

  private async assertOccurrenceExists(occurrenceId: string): Promise<void> {
    const occurrence = await this.prisma.classOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { id: true },
    });
    if (!occurrence) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
    }
  }

  private async detailById(id: string): Promise<AdminReservationDetail> {
    const reservation = await this.prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: ADMIN_INCLUDE,
    });
    return toAdminDetail(reservation);
  }
}

function toAdminDetail(reservation: AdminReservationRow): AdminReservationDetail {
  const actor = (user: { id: string; fullName: string } | null): ReservationActor | null =>
    user && {
      id: user.id,
      fullName: user.fullName,
      kind:
        user.id === reservation.clientId ? ReservationActorKind.CLIENT : ReservationActorKind.STAFF,
    };
  return {
    ...toReservationDetail(reservation),
    client: reservation.client,
    createdBy: actor(reservation.createdBy),
    cancelledBy: actor(reservation.cancelledBy),
  };
}
