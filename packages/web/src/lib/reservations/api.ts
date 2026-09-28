import { z } from "zod";
import {
  IDEMPOTENCY_KEY_HEADER,
  reservationDetailSchema,
  type MyReservationsQuery,
  type ReservationDetail,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

/** `idempotencyKey`: uma por intenção de reserva, reutilizada nas novas tentativas. */
export async function createReservation(
  occurrenceId: string,
  idempotencyKey: string,
): Promise<ReservationDetail> {
  const response = await authFetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json", [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify({ occurrenceId }),
  });
  return reservationDetailSchema.parse(await parseOrThrow(response));
}

export async function cancelReservation(reservationId: string): Promise<ReservationDetail> {
  const response = await authFetch(`/api/reservations/${reservationId}/cancel`, {
    method: "POST",
  });
  return reservationDetailSchema.parse(await parseOrThrow(response));
}

/** `idempotencyKey`: uma por intenção de remarcação, reutilizada nas novas tentativas. */
export async function rescheduleReservation(
  reservationId: string,
  occurrenceId: string,
  idempotencyKey: string,
): Promise<ReservationDetail> {
  const response = await authFetch(`/api/reservations/${reservationId}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify({ occurrenceId }),
  });
  return reservationDetailSchema.parse(await parseOrThrow(response));
}

export async function listMyReservations(query: MyReservationsQuery): Promise<ReservationDetail[]> {
  const params = new URLSearchParams({ when: query.when });
  if (query.status) params.set("status", query.status);
  const response = await authFetch(`/api/reservations?${params.toString()}`);
  return z.array(reservationDetailSchema).parse(await parseOrThrow(response));
}
