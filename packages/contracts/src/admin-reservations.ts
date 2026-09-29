import { z } from "zod";
import { localDateSchema } from "./agenda.js";
import { reservationDetailSchema, reservationStatusSchema } from "./reservations.js";

/** Quem executou uma ação: o próprio cliente ou um membro da equipe. */
export const ReservationActorKind = {
  CLIENT: "CLIENT",
  STAFF: "STAFF",
} as const;
export type ReservationActorKindName =
  (typeof ReservationActorKind)[keyof typeof ReservationActorKind];

export const reservationActorSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  kind: z.enum([ReservationActorKind.CLIENT, ReservationActorKind.STAFF]),
});
export type ReservationActor = z.infer<typeof reservationActorSchema>;

/**
 * Reserva na visão da equipe: o mesmo detalhe do cliente, mais de quem é e
 * quem a criou e a cancelou (null em reservas anteriores ao registro do ator,
 * ou ainda não canceladas).
 */
export const adminReservationDetailSchema = reservationDetailSchema.extend({
  client: z.object({ id: z.string(), fullName: z.string(), email: z.string() }),
  createdBy: reservationActorSchema.nullable(),
  cancelledBy: reservationActorSchema.nullable(),
});
export type AdminReservationDetail = z.infer<typeof adminReservationDetailSchema>;

/**
 * Filtros da consulta administrativa. `from` e `to` são datas locais da
 * academia (inclusivas) aplicadas ao horário da aula.
 */
export const adminReservationsQuerySchema = z
  .object({
    clientId: z.string().min(1).optional(),
    occurrenceId: z.string().min(1).optional(),
    status: reservationStatusSchema.optional(),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "O período é inválido: a data inicial vem depois da final.",
    path: ["to"],
  });
export type AdminReservationsQuery = z.infer<typeof adminReservationsQuerySchema>;

export const createAdminReservationRequestSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  occurrenceId: z.string().min(1, "Selecione uma aula."),
});
export type CreateAdminReservationRequest = z.infer<typeof createAdminReservationRequestSchema>;

/** Prévia de "pode reservar?": `replacingReservationId` simula a remarcação dessa reserva. */
export const reservationPreviewQuerySchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  occurrenceId: z.string().min(1, "Selecione uma aula."),
  replacingReservationId: z.string().min(1).optional(),
});
export type ReservationPreviewQuery = z.infer<typeof reservationPreviewQuerySchema>;

/** O motivo da recusa: o mesmo código, mensagem e detalhes que a reserva devolveria. */
export const reservationRefusalSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ReservationRefusal = z.infer<typeof reservationRefusalSchema>;

export const reservationPreviewSchema = z.object({
  canBook: z.boolean(),
  capacity: z.number().int(),
  /** Capacidade − reservas confirmadas, no momento da consulta (informativo). */
  availableSpots: z.number().int(),
  reason: reservationRefusalSchema.nullable(),
});
export type ReservationPreview = z.infer<typeof reservationPreviewSchema>;
