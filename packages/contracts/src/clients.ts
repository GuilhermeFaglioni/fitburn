import { z } from "zod";
import { UserStatus } from "./auth.js";
import { planAssignmentSchema } from "./plans.js";

/**
 * Status de cliente que a tela filtra. "Excluído" (anonimização, #43) é um
 * estado à parte: um cliente excluído nunca aparece na lista.
 */
export const clientStatusSchema = z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]);

/** Filtros da lista de clientes; `search` procura em nome, e-mail e documento. */
export const clientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: clientStatusSchema.optional(),
});
export type ClientsQuery = z.infer<typeof clientsQuerySchema>;

/** O plano ativo do cliente hoje (o que vale até `endDate`), ou nenhum. */
export const clientActivePlanSchema = z.object({ name: z.string(), endDate: z.string() });
export type ClientActivePlan = z.infer<typeof clientActivePlanSchema>;

/** Uma linha da lista de clientes. */
export const clientListItemSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  document: z.string().nullable(),
  status: clientStatusSchema,
  activePlan: clientActivePlanSchema.nullable(),
});
export type ClientListItem = z.infer<typeof clientListItemSchema>;

/** Dados pessoais e situação de um cliente (aba "Dados pessoais" do detalhe). */
export const clientDetailSchema = clientListItemSchema.extend({
  birthDate: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
});
export type ClientDetail = z.infer<typeof clientDetailSchema>;

/**
 * Edição de cliente: só os dados pessoais, cada um opcional mas nunca vazio
 * (o cadastro exige todos). `.strict()`: status e senha têm ações próprias.
 */
export const updateClientRequestSchema = z
  .object({
    fullName: z.string().trim().min(1, "Nome completo é obrigatório.").optional(),
    email: z.string().trim().email("E-mail inválido.").optional(),
    phone: z.string().trim().min(1, "Telefone é obrigatório.").optional(),
    birthDate: z.string().date("Data de nascimento inválida.").optional(),
    document: z.string().trim().min(1, "Documento é obrigatório.").optional(),
    address: z.string().trim().min(1, "Endereço é obrigatório.").optional(),
  })
  .strict();
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

/** O plano ativo e o histórico de planos do cliente (aba "Plano e histórico"). */
export const clientPlanSchema = z.object({
  active: planAssignmentSchema.nullable(),
  history: z.array(planAssignmentSchema),
});
export type ClientPlan = z.infer<typeof clientPlanSchema>;
