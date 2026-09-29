import type { Prisma } from "@prisma/client";
import type { ReservationDetail } from "@fitburn/contracts";

/** O que carregar junto da reserva para montar o detalhe (a aula, a modalidade e o professor). */
export const DETAIL_INCLUDE = {
  occurrence: {
    include: {
      modality: { select: { id: true, name: true } },
      instructor: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.ReservationInclude;

export type ReservationWithOccurrence = Prisma.ReservationGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

export function toReservationDetail(reservation: ReservationWithOccurrence): ReservationDetail {
  const { occurrence } = reservation;
  return {
    id: reservation.id,
    status: reservation.status,
    occurrence: {
      id: occurrence.id,
      name: occurrence.name,
      modality: occurrence.modality,
      instructor: occurrence.instructor,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      durationMinutes: occurrence.durationMinutes,
      status: occurrence.status,
    },
    createdAt: reservation.createdAt.toISOString(),
    cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
  };
}
