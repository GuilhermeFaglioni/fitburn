import { z } from "zod";
import { localDateSchema } from "./agenda.js";

export const GoalStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type GoalStatusName = (typeof GoalStatus)[keyof typeof GoalStatus];
export const goalStatusSchema = z.enum(
  Object.values(GoalStatus) as [GoalStatusName, ...GoalStatusName[]],
);

const titleSchema = z
  .string()
  .trim()
  .min(1, "O título da meta é obrigatório.")
  .max(120, "O título pode ter no máximo 120 caracteres.");
const descriptionSchema = z
  .string()
  .trim()
  .max(500, "A descrição pode ter no máximo 500 caracteres.");

export const createGoalRequestSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  title: titleSchema,
  description: descriptionSchema.optional(),
  /** Prazo opcional, dia local da academia ("YYYY-MM-DD"). */
  dueDate: localDateSchema.optional(),
});
export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>;

/** Só uma meta ativa pode ser editada; null limpa a descrição ou o prazo. */
export const updateGoalRequestSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  dueDate: localDateSchema.nullable().optional(),
});
export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>;

export const goalsQuerySchema = z.object({ clientId: z.string().min(1, "Selecione um cliente.") });
export type GoalsQuery = z.infer<typeof goalsQuerySchema>;

export const goalDetailSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: goalStatusSchema,
  /** Quando foi concluída; null se não foi. */
  concludedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type GoalDetail = z.infer<typeof goalDetailSchema>;
