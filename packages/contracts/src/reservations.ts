import { z } from "zod";
import { instructorSummarySchema } from "./catalog.js";
import { occurrenceStatusSchema } from "./agenda.js";

export const ReservationStatus = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
} as const;
export type ReservationStatusName = (typeof ReservationStatus)[keyof typeof ReservationStatus];
export const reservationStatusSchema = z.enum(
  Object.values(ReservationStatus) as [ReservationStatusName, ...ReservationStatusName[]],
);

/**
 * Header obrigatório na criação e remarcação: um UUID gerado pelo cliente por
 * intenção de reserva e reutilizado nas novas tentativas dessa intenção.
 */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const idempotencyKeySchema = z.uuid({
  error: (issue) =>
    issue.input === undefined
      ? "O header Idempotency-Key é obrigatório."
      : "O header Idempotency-Key deve ser um UUID.",
});

export const createReservationRequestSchema = z.object({
  occurrenceId: z.string().min(1, "Selecione uma aula."),
});
export type CreateReservationRequest = z.infer<typeof createReservationRequestSchema>;

/** A aula de uma reserva — inclusive passada ou cancelada, ao contrário da agenda. */
export const reservationOccurrenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  modality: z.object({ id: z.string(), name: z.string() }),
  instructor: instructorSummarySchema.nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  status: occurrenceStatusSchema,
});
export type ReservationOccurrence = z.infer<typeof reservationOccurrenceSchema>;

export const reservationDetailSchema = z.object({
  id: z.string(),
  status: reservationStatusSchema,
  occurrence: reservationOccurrenceSchema,
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
});
export type ReservationDetail = z.infer<typeof reservationDetailSchema>;

/** `details` do erro CLASS_FULL: as vagas no momento da recusa (sempre 0). */
export const classFullDetailsSchema = z.object({
  currentAvailableSpots: z.number().int(),
});
export type ClassFullDetails = z.infer<typeof classFullDetailsSchema>;
