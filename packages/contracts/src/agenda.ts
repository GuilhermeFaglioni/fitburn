import { z } from "zod";
import {
  capacitySchema,
  classTemplateDetailSchema,
  durationMinutesSchema,
  instructorSummarySchema,
} from "./catalog.js";

export const OccurrenceStatus = {
  SCHEDULED: "SCHEDULED",
  CANCELLED: "CANCELLED",
} as const;
export type OccurrenceStatusName = (typeof OccurrenceStatus)[keyof typeof OccurrenceStatus];
const occurrenceStatusEnum = z.enum(
  Object.values(OccurrenceStatus) as [OccurrenceStatusName, ...OccurrenceStatusName[]],
);

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Data inválida.");

export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

export const dateRangeQuerySchema = z.object({ from: localDateSchema, to: localDateSchema });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const createOccurrenceRequestSchema = z.object({
  templateId: z.string().min(1, "Selecione um template."),
  date: localDateSchema,
  startTime: localTimeSchema,
  /** Ausente = herda o professor padrão do template; null = sem professor. */
  instructorId: z.string().min(1).nullable().optional(),
  /** Ausente = herda a capacidade do template. */
  capacity: capacitySchema.optional(),
});
export type CreateOccurrenceRequest = z.infer<typeof createOccurrenceRequestSchema>;

export const updateOccurrenceRequestSchema = z.object({
  date: localDateSchema.optional(),
  startTime: localTimeSchema.optional(),
  durationMinutes: durationMinutesSchema.optional(),
  capacity: capacitySchema.optional(),
  /** Substituição do professor só nesta ocorrência; null = sem professor. */
  instructorId: z.string().min(1).nullable().optional(),
});
export type UpdateOccurrenceRequest = z.infer<typeof updateOccurrenceRequestSchema>;

/** Horizonte máximo de uma criação recorrente. */
export const RECURRENCE_MAX_MONTHS = 6;

export const createRecurringOccurrencesRequestSchema = z.object({
  templateId: z.string().min(1, "Selecione um template."),
  /** 0 = domingo … 6 = sábado. */
  weekdays: z.array(z.number().int().min(0).max(6)),
  startTime: localTimeSchema,
  startDate: localDateSchema,
  endDate: localDateSchema,
  instructorId: z.string().min(1).nullable().optional(),
  capacity: capacitySchema.optional(),
});
export type CreateRecurringOccurrencesRequest = z.infer<
  typeof createRecurringOccurrencesRequestSchema
>;

export const occurrenceDetailSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  seriesId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  modality: z.object({ id: z.string(), name: z.string() }),
  instructor: instructorSummarySchema.nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  capacity: z.number().int(),
  /** Reservas confirmadas. Até a Fase 3 (reservas) é sempre 0. */
  bookedCount: z.number().int(),
  status: occurrenceStatusEnum,
});
export type OccurrenceDetail = z.infer<typeof occurrenceDetailSchema>;

export const occurrenceConflictSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});
export type OccurrenceConflict = z.infer<typeof occurrenceConflictSchema>;

/** `details` do erro OCCURRENCE_OVERLAP. */
export const occurrenceOverlapDetailsSchema = z.object({
  conflicts: z.array(occurrenceConflictSchema),
});
export type OccurrenceOverlapDetails = z.infer<typeof occurrenceOverlapDetailsSchema>;

export const occurrenceFormOptionsSchema = z.object({
  templates: z.array(classTemplateDetailSchema),
  instructors: z.array(instructorSummarySchema),
});
export type OccurrenceFormOptions = z.infer<typeof occurrenceFormOptionsSchema>;

export const recurringOccurrencesResultSchema = z.object({
  seriesId: z.string(),
  occurrences: z.array(occurrenceDetailSchema),
});
export type RecurringOccurrencesResult = z.infer<typeof recurringOccurrencesResultSchema>;
