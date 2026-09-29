import type { GamificationRuleKind, PrismaClient } from "@prisma/client";

/**
 * Configuração inicial das regras de pontuação (docs/mvp-web-pwa.md,
 * "Gamificação administrativa"). É dado de seed: o cálculo lê as linhas da
 * tabela gamification_rules, nunca esta lista — ajustar a pontuação é mexer
 * no banco.
 */
export const DEFAULT_GAMIFICATION_RULES: Array<{
  kind: GamificationRuleKind;
  threshold: number;
  points: number;
}> = [
  { kind: "ATTENDANCE_POINTS", threshold: 0, points: 10 },
  { kind: "GOAL_POINTS", threshold: 0, points: 25 },
  { kind: "STREAK_MILESTONE", threshold: 3, points: 5 },
  { kind: "STREAK_MILESTONE", threshold: 5, points: 10 },
  { kind: "STREAK_MILESTONE", threshold: 10, points: 20 },
];

/** Cria as regras que faltam sem sobrescrever as que já foram ajustadas no banco. */
export async function seedGamificationRules(
  prisma: Pick<PrismaClient, "gamificationRule">,
): Promise<void> {
  for (const rule of DEFAULT_GAMIFICATION_RULES) {
    await prisma.gamificationRule.upsert({
      where: { kind_threshold: { kind: rule.kind, threshold: rule.threshold } },
      update: {},
      create: rule,
    });
  }
}
