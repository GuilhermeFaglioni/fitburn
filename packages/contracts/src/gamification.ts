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
});
export type PointsHistoryItem = z.infer<typeof pointsHistoryItemSchema>;

/** Gamificação de um cliente: o total de pontos e o histórico recente, do mais novo para o mais antigo. */
export const gamificationSummarySchema = z.object({
  totalPoints: z.number().int(),
  history: z.array(pointsHistoryItemSchema),
});
export type GamificationSummary = z.infer<typeof gamificationSummarySchema>;
