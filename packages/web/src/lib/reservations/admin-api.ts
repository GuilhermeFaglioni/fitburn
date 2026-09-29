import { z } from "zod";
import {
  adminReservationDetailSchema,
  IDEMPOTENCY_KEY_HEADER,
  reservationPreviewSchema,
  type AdminReservationDetail,
  type AdminReservationsQuery,
  type ReservationPreview,
  type ReservationPreviewQuery,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const BASE = "/api/admin/reservations";

export async function listAdminReservations(
  query: AdminReservationsQuery,
): Promise<AdminReservationDetail[]> {
  const params = new URLSearchParams();
  if (query.clientId) params.set("clientId", query.clientId);
  if (query.occurrenceId) params.set("occurrenceId", query.occurrenceId);
  if (query.status) params.set("status", query.status);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const suffix = params.toString();

  const response = await authFetch(`${BASE}${suffix ? `?${suffix}` : ""}`);
  return z.array(adminReservationDetailSchema).parse(await parseOrThrow(response));
}

/** "Pode reservar? Por quê?": só leitura, sem efeito colateral. */
export async function previewReservation(
  query: ReservationPreviewQuery,
): Promise<ReservationPreview> {
  const params = new URLSearchParams({
    clientId: query.clientId,
    occurrenceId: query.occurrenceId,
  });
  if (query.replacingReservationId) {
    params.set("replacingReservationId", query.replacingReservationId);
  }
  const response = await authFetch(`${BASE}/preview?${params.toString()}`);
  return reservationPreviewSchema.parse(await parseOrThrow(response));
}

/** `idempotencyKey`: uma por intenção (cliente + aula), reutilizada nas novas tentativas. */
export async function createAdminReservation(
  clientId: string,
  occurrenceId: string,
  idempotencyKey: string,
): Promise<AdminReservationDetail> {
  const response = await authFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify({ clientId, occurrenceId }),
  });
  return adminReservationDetailSchema.parse(await parseOrThrow(response));
}

export async function cancelAdminReservation(
  reservationId: string,
): Promise<AdminReservationDetail> {
  const response = await authFetch(`${BASE}/${reservationId}/cancel`, { method: "POST" });
  return adminReservationDetailSchema.parse(await parseOrThrow(response));
}

/** `idempotencyKey`: uma por intenção de remarcação, reutilizada nas novas tentativas. */
export async function rescheduleAdminReservation(
  reservationId: string,
  occurrenceId: string,
  idempotencyKey: string,
): Promise<AdminReservationDetail> {
  const response = await authFetch(`${BASE}/${reservationId}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify({ occurrenceId }),
  });
  return adminReservationDetailSchema.parse(await parseOrThrow(response));
}
