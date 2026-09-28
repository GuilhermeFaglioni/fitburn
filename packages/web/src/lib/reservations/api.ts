import {
  IDEMPOTENCY_KEY_HEADER,
  reservationDetailSchema,
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
