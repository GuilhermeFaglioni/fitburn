import { Injectable } from "@nestjs/common";
import type { GamificationRuleKind, PointsEntry, Prisma } from "@prisma/client";
import {
  AttendanceStatus,
  ErrorCode,
  ErrorStatus,
  PointsEntryType,
  ReservationStatus,
  SystemProfileName,
  type AttendanceMark,
  type GamificationSummary,
  type PointsHistoryItem,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { clientScopeFilter } from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { currentStreak, planStreak, type RegisteredAttendance, type StreakPlan } from "./streak.js";

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
      this.prisma.streakBadge.findMany({ where: { clientId, revokedAt: null } }),
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
   * Efeitos de uma marcação de presença sobre pontos, streak e badges: lança os
   * pontos de uma presença nova, estorna os de uma presença corrigida para
   * falta e ajusta bônus e badges ao histórico de agora (uma falta pode
   * desfazer uma sequência premiada; uma presença pode fundir duas). Roda na
   * transação de quem registrou: se algo falhar, a marcação também não vale.
   * O lock por cliente serializa registros simultâneos em aulas diferentes,
   * para nenhum deles perder ou repetir um bônus.
   */
  async applyAttendanceChange(
    tx: Prisma.TransactionClient,
    input: {
      clientId: string;
      reservationId: string;
      occurredAt: Date;
      /** Se a reserva já estava marcada como presente antes (é uma correção de presente para falta, se `mark` é faltou). */
      wasPresent: boolean;
      /** O que o professor marcou. */
      mark: AttendanceMark;
    },
  ): Promise<void> {
    await lockAdvisory(tx, `gamification-client:${input.clientId}`);

    if (input.mark === AttendanceStatus.PRESENT) {
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
    } else if (input.wasPresent) {
      const live = await tx.pointsEntry.findMany({
        where: {
          reservationId: input.reservationId,
          type: PointsEntryType.ATTENDANCE,
          reversedBy: null,
        },
      });
      for (const entry of live) await this.reverse(tx, entry);
    }

    await this.reconcileStreak(tx, input.clientId, input.reservationId);
  }

  /**
   * Ajusta bônus e badges do cliente ao histórico cronológico de presenças e
   * faltas depois da marcação de uma reserva (ver planStreak).
   */
  private async reconcileStreak(
    tx: Prisma.TransactionClient,
    clientId: string,
    changedReservationId: string,
  ): Promise<void> {
    const badges = await tx.streakBadge.findMany({ where: { clientId } });
    const liveBonuses = await tx.pointsEntry.findMany({
      where: { clientId, type: PointsEntryType.STREAK_BONUS, reversedBy: null },
      orderBy: [{ occurredAt: "asc" }, { sequence: "asc" }],
    });

    const plan = planStreak({
      history: await this.attendanceHistory(tx, clientId),
      changedReservationId,
      milestones: await this.streakMilestones(tx),
      liveBonuses,
      activeBadges: new Set(badges.filter((b) => b.revokedAt === null).map((b) => b.milestone)),
    });
    await this.applyStreakPlan(tx, clientId, plan);
  }

  private async applyStreakPlan(
    tx: Prisma.TransactionClient,
    clientId: string,
    plan: StreakPlan<PointsEntry>,
  ): Promise<void> {
    for (const bonus of plan.surplus) await this.reverse(tx, bonus);
    for (const award of plan.awards) {
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
    for (const { threshold, awardedAt } of plan.badgesToGrant) {
      await tx.streakBadge.upsert({
        where: { clientId_milestone: { clientId, milestone: threshold } },
        create: { clientId, milestone: threshold, awardedAt },
        update: { awardedAt, revokedAt: null },
      });
    }
    if (plan.badgesToRevoke.length > 0) {
      await tx.streakBadge.updateMany({
        where: { clientId, milestone: { in: plan.badgesToRevoke } },
        data: { revokedAt: new Date() },
      });
    }
  }

  /** Estorna um lançamento: outro lançamento, de sinal contrário e do mesmo instante, que aponta para ele. */
  private reverse(tx: Prisma.TransactionClient, entry: PointsEntry) {
    return tx.pointsEntry.create({
      data: {
        type: PointsEntryType.REVERSAL,
        points: -entry.points,
        clientId: entry.clientId,
        milestone: entry.milestone,
        reservationId: entry.reservationId,
        // No instante do evento original: os totais por período continuam fechando.
        occurredAt: entry.occurredAt,
        reversesEntryId: entry.id,
      },
    });
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
