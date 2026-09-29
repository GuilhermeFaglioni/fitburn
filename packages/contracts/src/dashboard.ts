import { z } from "zod";
import { rankingPeriodSchema } from "./gamification.js";

export const dashboardQuerySchema = z.object({
  period: rankingPeriodSchema.default("week"),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/** Uma aula (ocorrência não cancelada) com a ocupação: reservas que ainda valem (todas menos as canceladas). */
export const dashboardOccupancyItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsAt: z.string(),
  capacity: z.number().int(),
  booked: z.number().int(),
  /** Vagas livres (nunca negativa). */
  availableSpots: z.number().int(),
});
export type DashboardOccupancyItem = z.infer<typeof dashboardOccupancyItemSchema>;

export const dashboardTopClientSchema = z.object({
  /** Identificador estável do cliente (chave de lista na tela). */
  clientId: z.string(),
  position: z.number().int(),
  fullName: z.string(),
  points: z.number().int(),
  attendances: z.number().int(),
  tied: z.boolean(),
});
export type DashboardTopClient = z.infer<typeof dashboardTopClientSchema>;

/**
 * Dashboard da equipe. Cada bloco vem `null` quando quem vê não tem acesso ao
 * módulo que o alimenta (aulas, clientes ou gamificação); os números já vêm
 * limitados ao escopo dessa pessoa nesse módulo.
 */
export const dashboardSchema = z.object({
  period: rankingPeriodSchema,
  /** Primeiro e último dia do período dos indicadores, "YYYY-MM-DD". */
  from: z.string(),
  to: z.string(),
  /** Hoje no calendário da academia. */
  today: z.string(),
  occupancy: z
    .object({
      today: z.array(dashboardOccupancyItemSchema),
      /** A semana atual (segunda a domingo), independente do período escolhido. */
      week: z.array(dashboardOccupancyItemSchema),
    })
    .nullable(),
  activeClients: z.object({ total: z.number().int() }).nullable(),
  gamification: z
    .object({
      pointsDistributed: z.number().int(),
      attendances: z.number().int(),
      clientsWithActiveStreak: z.number().int(),
      top: z.array(dashboardTopClientSchema),
    })
    .nullable(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
