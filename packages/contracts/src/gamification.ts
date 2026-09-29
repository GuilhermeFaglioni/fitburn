import { z } from "zod";

export const PointsEntryType = {
  ATTENDANCE: "ATTENDANCE",
  GOAL: "GOAL",
  STREAK_BONUS: "STREAK_BONUS",
  REVERSAL: "REVERSAL",
} as const;
export type PointsEntryTypeName = (typeof PointsEntryType)[keyof typeof PointsEntryType];
export const pointsEntryTypeSchema = z.enum(
  Object.values(PointsEntryType) as [PointsEntryTypeName, ...PointsEntryTypeName[]],
);

/** Um ganho (ou estorno, com pontos negativos) no histórico de pontos. */
export const pointsHistoryItemSchema = z.object({
  id: z.string(),
  type: pointsEntryTypeSchema,
  points: z.number().int(),
  /** Quando o evento aconteceu (o horário da aula, a conclusão da meta). */
  occurredAt: z.string(),
  /** O que gerou os pontos: o nome da aula ou o título da meta; null quando não há. */
  subject: z.string().nullable(),
  /** O marco de streak que um bônus celebra; null nos demais tipos. */
  milestone: z.number().int().nullable(),
});
export type PointsHistoryItem = z.infer<typeof pointsHistoryItemSchema>;

/**
 * O streak: presenças consecutivas até agora (uma falta zera; cancelamento e
 * reserva ainda não marcada não contam) e o próximo marco a alcançar, com o
 * bônus que ele dá; null quando todos os marcos já foram atingidos.
 */
export const streakSchema = z.object({
  current: z.number().int(),
  next: z.object({ threshold: z.number().int(), bonusPoints: z.number().int() }).nullable(),
});
export type Streak = z.infer<typeof streakSchema>;

/** Badge de um marco de streak: um por marco configurado, conquistado ou ainda bloqueado. */
export const streakBadgeSchema = z.object({
  milestone: z.number().int(),
  earned: z.boolean(),
  /** Quando foi conquistado; null enquanto bloqueado. */
  awardedAt: z.string().nullable(),
});
export type StreakBadgeItem = z.infer<typeof streakBadgeSchema>;

/**
 * Gamificação de um cliente: o total de pontos, o histórico recente (do mais
 * novo para o mais antigo), o streak e os badges, do menor marco para o maior.
 */
export const gamificationSummarySchema = z.object({
  totalPoints: z.number().int(),
  history: z.array(pointsHistoryItemSchema),
  streak: streakSchema,
  badges: z.array(streakBadgeSchema),
});
export type GamificationSummary = z.infer<typeof gamificationSummarySchema>;
