import { z } from "zod";
import { UserStatus, userStatusSchema } from "./auth.js";
import { gamificationSummarySchema } from "./gamification.js";
import { myPlanSchema } from "./plans.js";
import { reservationDetailSchema } from "./reservations.js";
import { userDetailSchema } from "./users.js";
import { workoutSheetSchema } from "./workout-sheets.js";

/** Excluídos nunca aparecem na lista, então não há filtro por eles. */
const listableStatusSchema = z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]);

/**
 * Busca da lista de clientes: `search` casa (sem diferenciar maiúsculas)
 * com parte do nome, do e-mail ou do documento.
 */
export const clientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: listableStatusSchema.optional(),
});
export type ClientsQuery = z.infer<typeof clientsQuerySchema>;

/** Uma linha da lista de clientes, com o plano ativo (se tiver). */
export const clientListItemSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  document: z.string().nullable(),
  status: userStatusSchema,
  activePlan: z.object({ name: z.string(), endDate: z.string() }).nullable(),
});
export type ClientListItem = z.infer<typeof clientListItemSchema>;

/** Edição dos dados do cliente: sem perfil de acesso, status nem senha. */
export const updateClientRequestSchema = z
  .object({
    fullName: z.string().trim().min(1, "Nome completo é obrigatório.").optional(),
    email: z.string().trim().email("E-mail inválido.").optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    birthDate: z.string().date("Data de nascimento inválida.").nullable().optional(),
    document: z.string().trim().min(1).nullable().optional(),
    address: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

/**
 * A visão consolidada de um cliente: dados pessoais, plano (o ativo e o
 * histórico), reservas futuras e passadas, gamificação e fichas de treino.
 */
export const clientOverviewSchema = z.object({
  client: userDetailSchema,
  plan: myPlanSchema,
  upcomingReservations: z.array(reservationDetailSchema),
  pastReservations: z.array(reservationDetailSchema),
  gamification: gamificationSummarySchema,
  workoutSheets: z.array(workoutSheetSchema),
});
export type ClientOverview = z.infer<typeof clientOverviewSchema>;
