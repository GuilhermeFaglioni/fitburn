import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();
const nullableText = z.string().trim().min(1).nullable().optional();

export const createModalityRequestSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  description: optionalText,
});
export type CreateModalityRequest = z.infer<typeof createModalityRequestSchema>;

export const updateModalityRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: nullableText,
});
export type UpdateModalityRequest = z.infer<typeof updateModalityRequestSchema>;

export const modalityDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  /** Qualquer template (ativo ou não) impede a exclusão da modalidade. */
  templateCount: z.number().int(),
  activeTemplateCount: z.number().int(),
});
export type ModalityDetail = z.infer<typeof modalityDetailSchema>;

export const durationMinutesSchema = z
  .number()
  .int("A duração precisa ser um número inteiro de minutos.")
  .min(1, "A duração precisa ser de pelo menos 1 minuto.")
  .max(24 * 60, "A duração não pode passar de 24 horas.");
export const capacitySchema = z
  .number()
  .int("A capacidade precisa ser um número inteiro.")
  .min(1, "A capacidade precisa ser de pelo menos 1 vaga.");

export const createClassTemplateRequestSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  description: optionalText,
  durationMinutes: durationMinutesSchema,
  capacity: capacitySchema,
  modalityId: z.string().min(1, "Selecione uma modalidade."),
  defaultInstructorId: z.string().min(1).nullable().optional(),
});
export type CreateClassTemplateRequest = z.infer<typeof createClassTemplateRequestSchema>;

export const updateClassTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: nullableText,
  durationMinutes: durationMinutesSchema.optional(),
  capacity: capacitySchema.optional(),
  modalityId: z.string().min(1).optional(),
  defaultInstructorId: z.string().min(1).nullable().optional(),
});
export type UpdateClassTemplateRequest = z.infer<typeof updateClassTemplateRequestSchema>;

export const instructorSummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
});
export type InstructorSummary = z.infer<typeof instructorSummarySchema>;

export const classTemplateDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  durationMinutes: z.number().int(),
  capacity: z.number().int(),
  isActive: z.boolean(),
  modality: z.object({ id: z.string(), name: z.string() }),
  defaultInstructor: instructorSummarySchema.nullable(),
});
export type ClassTemplateDetail = z.infer<typeof classTemplateDetailSchema>;
