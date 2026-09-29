import { z } from "zod";
import { instructorSummarySchema } from "./catalog.js";

/**
 * Situação da presença de uma reserva: pendente enquanto o professor não
 * registrou nada; presente conclui a reserva e faltou a marca como não
 * compareceu (docs/mvp-web-pwa.md, "Presença").
 */
export const AttendanceStatus = {
  PENDING: "PENDING",
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
} as const;
export type AttendanceStatusName = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];
export const attendanceStatusSchema = z.enum(
  Object.values(AttendanceStatus) as [AttendanceStatusName, ...AttendanceStatusName[]],
);

/** O que o professor pode registrar: os únicos estados de presença são presente e faltou. */
export const attendanceMarkSchema = z.enum([AttendanceStatus.PRESENT, AttendanceStatus.ABSENT]);
export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;

export const markAttendanceRequestSchema = z.object({ status: attendanceMarkSchema });
export type MarkAttendanceRequest = z.infer<typeof markAttendanceRequestSchema>;

/** Uma aula em "Minhas aulas", com o andamento do registro de presença. */
export const attendanceClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  modality: z.object({ id: z.string(), name: z.string() }),
  instructor: instructorSummarySchema.nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  /** Clientes com reserva viva: confirmada, concluída ou não compareceu (cancelada não conta). */
  totalCount: z.number().int(),
  /** Desses, os que já têm presente ou faltou registrado. */
  registeredCount: z.number().int(),
});
export type AttendanceClass = z.infer<typeof attendanceClassSchema>;

/** Um cliente na lista de presença de uma aula. */
export const attendanceEntrySchema = z.object({
  reservationId: z.string(),
  client: z.object({ id: z.string(), fullName: z.string() }),
  status: attendanceStatusSchema,
});
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

export const attendanceRosterSchema = z.object({
  class: attendanceClassSchema,
  entries: z.array(attendanceEntrySchema),
});
export type AttendanceRoster = z.infer<typeof attendanceRosterSchema>;
