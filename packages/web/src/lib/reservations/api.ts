import { reservationDetailSchema, type ReservationDetail } from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function createReservation(occurrenceId: string): Promise<ReservationDetail> {
  const response = await authFetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ occurrenceId }),
  });
  return reservationDetailSchema.parse(await parseOrThrow(response));
}
