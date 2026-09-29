import { Injectable } from "@nestjs/common";
import type { GamificationRuleKind, Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  PointsEntryType,
  ReservationStatus,
  SystemProfileName,
  type GamificationSummary,
  type PointsHistoryItem,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { clientScopeFilter } from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { currentStreak, runContaining, streakAwards, type RegisteredAttendance } from "./streak.js";

type PointsEntryWithSubject = Prisma.PointsEntryGetPayload<{
  include: { reservation: { select: { occurrence: { select: { name: true } } } } };
}>;

/** Quantos lançamentos o "histórico recente" traz. */
const RECENT_HISTORY_SIZE = 20;

/**
 * Gamificação: pontos, lançados num ledger a partir de regras guardadas no
 * banco (gamification_rules). Nenhuma pontuação vive no código: cada
 * lançamento lê a regra vigente no momento em que acontece.
 */
@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Total de pontos, histórico recente, streak e badges de um cliente. */
  async summaryOf(clientId: string): Promise<GamificationSummary> {
    const [total, entries, history, milestones, badges] = await Promise.all([
      this.prisma.pointsEntry.aggregate({ where: { clientId }, _sum: { points: true } }),
      this.prisma.pointsEntry.findMany({
        where: { clientId },
        include: { reservation: { select: { occurrence: { select: { name: true } } } } },
        // A presença e o bônus que ela desperta têm o mesmo instante: a sequência desempata.
        orderBy: [{ occurredAt: "desc" }, { sequence: "desc" }],
        take: RECENT_HISTORY_SIZE,
      }),
      this.attendanceHistory(this.prisma, clientId),
      this.streakMilestones(this.prisma),
      this.prisma.streakBadge.findMany({ where: { clientId } }),
    ]);

    const streak = currentStreak(history);
    const next = milestones.find((milestone) => milestone.threshold > streak);
    const earned = new Map(badges.map((badge) => [badge.milestone, badge.awardedAt]));

    return {
      totalPoints: total._sum.points ?? 0,
      history: entries.map((entry) => this.toHistoryItem(entry)),
      streak: {
        current: streak,
        next: next ? { threshold: next.threshold, bonusPoints: next.points } : null,
      },
      badges: milestones.map(({ threshold }) => ({
        milestone: threshold,
        earned: earned.has(threshold),
        awardedAt: earned.get(threshold)?.toISOString() ?? null,
      })),
    };
  }

  /** Gamificação de um cliente vista pela equipe, dentro do escopo do perfil. */
  async summaryForStaff(
    clientId: string,
    requester: ScopedRequester,
  ): Promise<GamificationSummary> {
    const client = await this.prisma.user.findFirst({
      where: { id: clientId, profile: { name: SystemProfileName.CLIENT, isSystem: true } },
      select: { id: true },
    });
    if (!client) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Cliente não encontrado.", ErrorStatus.NOT_FOUND);
    }

    // AND, não spread: o filtro de escopo "próprio" também é uma condição sobre `id`.
    const inScope = await this.prisma.user.count({
      where: { AND: [{ id: clientId }, clientScopeFilter(requester)] },
    });
    if (inScope === 0) {
      throw new DomainError(
        ErrorCode.OUT_OF_SCOPE,
        "Este cliente está fora do seu escopo.",
        ErrorStatus.FORBIDDEN,
      );
    }
    return this.summaryOf(clientId);
  }

  /**
   * Efeitos de uma presença (não de uma falta): lança os pontos da presença e,
   * se ela completa um marco de streak, o bônus e o badge. Roda na transação
   * de quem registrou a presença: se algo falhar, a presença também não vale.
   */
  async recordAttendance(
    tx: Prisma.TransactionClient,
    input: { clientId: string; reservationId: string; occurredAt: Date },
  ): Promise<void> {
    const points = await this.pointsFor(tx, "ATTENDANCE_POINTS");
    await tx.pointsEntry.create({
      data: {
        type: PointsEntryType.ATTENDANCE,
        points,
        clientId: input.clientId,
        reservationId: input.reservationId,
        occurredAt: input.occurredAt,
      },
    });
    await this.awardStreak(tx, input.clientId, input.reservationId);
  }

  /**
   * Concede o que a sequência da presença recém-registrada merece e ainda não
   * recebeu: o bônus de cada marco que ela alcançou (uma vez por sequência,
   * então uma nova sequência paga de novo) e o badge do marco (uma vez na
   * vida). A sequência é recalculada a partir do histórico cronológico, então
   * uma presença registrada fora de ordem também conta. O lock por cliente
   * serializa registros simultâneos em aulas diferentes, para nenhum deles
   * perder o bônus.
   */
  private async awardStreak(
    tx: Prisma.TransactionClient,
    clientId: string,
    reservationId: string,
  ): Promise<void> {
    await lockAdvisory(tx, `gamification-client:${clientId}`);

    const run = runContaining(await this.attendanceHistory(tx, clientId), reservationId);
    if (!run) return;
    const rewarded = await tx.pointsEntry.findMany({
      where: { clientId, type: PointsEntryType.STREAK_BONUS },
      select: { milestone: true, reservationId: true },
    });
    const badges = await tx.streakBadge.findMany({
      where: { clientId },
      select: { milestone: true },
    });
    const badgedMilestones = new Set(badges.map((badge) => badge.milestone));

    const milestones = await this.streakMilestones(tx);
    for (const award of streakAwards(run, milestones, rewarded)) {
      if (award.bonusDue) {
        await tx.pointsEntry.create({
          data: {
            type: PointsEntryType.STREAK_BONUS,
            points: award.points,
            milestone: award.threshold,
            clientId,
            reservationId: award.completing.reservationId,
            occurredAt: award.completing.startsAt,
          },
        });
      }
      if (!badgedMilestones.has(award.threshold)) {
        await tx.streakBadge.create({
          data: { clientId, milestone: award.threshold, awardedAt: award.completing.startsAt },
        });
      }
    }
  }

  /**
   * Presenças e faltas já registradas do cliente, em ordem cronológica das
   * aulas. `db` é um cliente do Prisma qualquer: a transação de quem registra
   * ou o próprio PrismaService, na consulta do resumo.
   */
  private async attendanceHistory(
    db: Prisma.TransactionClient,
    clientId: string,
  ): Promise<RegisteredAttendance[]> {
    const rows = await db.reservation.findMany({
      where: {
        clientId,
        status: { in: [ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW] },
      },
      select: { id: true, status: true, occurrence: { select: { startsAt: true } } },
      orderBy: [{ occurrence: { startsAt: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      reservationId: row.id,
      present: row.status === ReservationStatus.COMPLETED,
      startsAt: row.occurrence.startsAt,
    }));
  }

  private toHistoryItem(entry: PointsEntryWithSubject): PointsHistoryItem {
    return {
      id: entry.id,
      type: entry.type,
      points: entry.points,
      occurredAt: entry.occurredAt.toISOString(),
      subject: entry.reservation?.occurrence.name ?? null,
      milestone: entry.milestone,
    };
  }

  /** Os marcos de streak configurados, do menor para o maior. */
  private streakMilestones(db: Prisma.TransactionClient) {
    return db.gamificationRule.findMany({
      // Um marco de 0 ou menos não faria sentido (e quebraria o cálculo).
      where: { kind: "STREAK_MILESTONE", threshold: { gt: 0 } },
      orderBy: { threshold: "asc" },
    });
  }

  private async pointsFor(
    tx: Prisma.TransactionClient,
    kind: GamificationRuleKind,
    threshold = 0,
  ): Promise<number> {
    const rule = await tx.gamificationRule.findUnique({
      where: { kind_threshold: { kind, threshold } },
    });
    // Regra ausente é implantação sem o seed de configuração, não erro de quem chamou.
    if (!rule)
      throw new Error(`Regra de gamificação ausente: ${kind} (${threshold}). Rode o seed.`);
    return rule.points;
  }
}
