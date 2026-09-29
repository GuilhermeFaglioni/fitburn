import { z } from "zod";
import { instructorSummarySchema } from "./catalog.js";

/** Atribuir um cliente a um professor: o professor passa a acompanhá-lo (escopo "clientes atribuídos"). */
export const createAssignmentRequestSchema = z.object({
  teacherId: z.string().min(1, "Selecione um professor."),
  clientId: z.string().min(1, "Selecione um cliente."),
});
export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;

export const assignmentsQuerySchema = z.object({
  teacherId: z.string().min(1).optional(),
});
export type AssignmentsQuery = z.infer<typeof assignmentsQuerySchema>;

export const clientSummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
});
export type ClientSummary = z.infer<typeof clientSummarySchema>;

export const assignmentSchema = z.object({
  id: z.string(),
  teacher: instructorSummarySchema,
  client: clientSummarySchema,
  createdAt: z.string(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

/** As opções do formulário de atribuição: professores (equipe ativa) e clientes ativos. */
export const assignmentOptionsSchema = z.object({
  teachers: z.array(instructorSummarySchema),
  clients: z.array(clientSummarySchema),
});
export type AssignmentOptions = z.infer<typeof assignmentOptionsSchema>;
