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
  /** O marco de streak a que o lançamento se refere (o do bônus e o do estorno dele); null nos demais. */
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

export const RankingPeriod = { WEEK: "week", MONTH: "month" } as const;
export type RankingPeriodName = (typeof RankingPeriod)[keyof typeof RankingPeriod];
export const rankingPeriodSchema = z.enum([RankingPeriod.WEEK, RankingPeriod.MONTH]);

export const rankingQuerySchema = z.object({
  period: rankingPeriodSchema.default(RankingPeriod.WEEK),
});
export type RankingQuery = z.infer<typeof rankingQuerySchema>;

/** Um participante do ranking, identificado só pelo primeiro nome e a inicial do sobrenome. */
export const rankingEntrySchema = z.object({
  /** Posição de competição: empatados dividem a posição e a seguinte é pulada (1, 1, 3). */
  position: z.number().int(),
  /** Como os outros veem a pessoa: o primeiro nome e a inicial do sobrenome ("Ana P."). */
  name: z.string(),
  /** Só o primeiro nome, para a própria linha ("Marina (você)"). */
  firstName: z.string(),
  /** Soma do ledger no período (presenças, bônus, metas e estornos). */
  points: z.number().int(),
  /** Presenças que valem no período: o critério de desempate. */
  attendances: z.number().int(),
  /** Outro participante tem os mesmos pontos e presenças. */
  tied: z.boolean(),
  /** É a pessoa que consultou. */
  isMe: z.boolean(),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

/**
 * Ranking do período atual (semana de segunda a domingo ou mês calendário, no
 * fuso da academia): os primeiros colocados e, se estiver fora deles, a
 * própria pessoa com a posição real.
 */
export const rankingSchema = z.object({
  period: rankingPeriodSchema,
  /** Primeiro e último dia do período, "YYYY-MM-DD". */
  from: z.string(),
  to: z.string(),
  entries: z.array(rankingEntrySchema),
});
export type Ranking = z.infer<typeof rankingSchema>;
