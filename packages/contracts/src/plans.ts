import { z } from "zod";
import { localDateSchema } from "./agenda.js";

const planNameSchema = z
  .string()
  .trim()
  .min(1, "O nome do plano é obrigatório.")
  .max(80, "O nome pode ter no máximo 80 caracteres.");
const planDescriptionSchema = z
  .string()
  .trim()
  .max(500, "A descrição pode ter no máximo 500 caracteres.");

export const createPlanRequestSchema = z.object({
  name: planNameSchema,
  description: planDescriptionSchema.optional(),
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

/** null limpa a descrição. */
export const updatePlanRequestSchema = z.object({
  name: planNameSchema.optional(),
  description: planDescriptionSchema.nullable().optional(),
});
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

/** Um plano do catálogo, com quantos clientes têm uma atribuição ativa dele. */
export const planDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  activeClientCount: z.number().int(),
});
export type PlanDetail = z.infer<typeof planDetailSchema>;

export const PlanAssignmentStatus = { ACTIVE: "ACTIVE", ENDED: "ENDED" } as const;
export type PlanAssignmentStatusName =
  (typeof PlanAssignmentStatus)[keyof typeof PlanAssignmentStatus];
export const planAssignmentStatusSchema = z.enum([
  PlanAssignmentStatus.ACTIVE,
  PlanAssignmentStatus.ENDED,
]);

export const assignPlanRequestSchema = z
  .object({
    clientId: z.string().min(1, "Selecione um cliente."),
    planId: z.string().min(1, "Selecione um plano."),
    startDate: localDateSchema,
    endDate: localDateSchema,
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "A data de término não pode ser anterior à de início.",
    path: ["endDate"],
  });
export type AssignPlanRequest = z.infer<typeof assignPlanRequestSchema>;

export const planAssignmentsQuerySchema = z.object({ clientId: z.string().min(1) });
export type PlanAssignmentsQuery = z.infer<typeof planAssignmentsQuerySchema>;

/**
 * Uma atribuição de plano a um cliente. `status` é o de agora: uma atribuição
 * cuja data de término já passou vale como encerrada.
 */
export const planAssignmentSchema = z.object({
  id: z.string(),
  plan: z.object({ id: z.string(), name: z.string(), description: z.string().nullable() }),
  startDate: z.string(),
  endDate: z.string(),
  status: planAssignmentStatusSchema,
});
export type PlanAssignment = z.infer<typeof planAssignmentSchema>;

/** O plano do cliente: o ativo (ou nenhum) e o histórico, do mais recente para o mais antigo. */
export const myPlanSchema = z.object({
  active: planAssignmentSchema.nullable(),
  history: z.array(planAssignmentSchema),
});
export type MyPlan = z.infer<typeof myPlanSchema>;

/** As opções do formulário de atribuição: planos ativos e clientes ativos, com o plano de cada um. */
export const planAssignmentOptionsSchema = z.object({
  plans: z.array(z.object({ id: z.string(), name: z.string() })),
  clients: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      email: z.string(),
      /** O plano ativo do cliente, se tiver: o que a nova atribuição encerraria. */
      activePlan: z.object({ name: z.string(), endDate: z.string() }).nullable(),
    }),
  ),
});
export type PlanAssignmentOptions = z.infer<typeof planAssignmentOptionsSchema>;
