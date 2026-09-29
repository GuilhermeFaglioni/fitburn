import { Injectable } from "@nestjs/common";
import type { GamificationRuleKind, Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  PointsEntryType,
  SystemProfileName,
  type GamificationSummary,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { clientScopeFilter } from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";

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

  /** Total de pontos e histórico recente de um cliente. */
  async summaryOf(clientId: string): Promise<GamificationSummary> {
    const [total, entries] = await Promise.all([
      this.prisma.pointsEntry.aggregate({ where: { clientId }, _sum: { points: true } }),
      this.prisma.pointsEntry.findMany({
        where: { clientId },
        include: { reservation: { select: { occurrence: { select: { name: true } } } } },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: RECENT_HISTORY_SIZE,
      }),
    ]);

    return {
      totalPoints: total._sum.points ?? 0,
      history: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        points: entry.points,
        occurredAt: entry.occurredAt.toISOString(),
        subject: entry.reservation?.occurrence.name ?? null,
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
   * Lança os pontos de uma presença. Roda na transação de quem registrou a
   * presença: se o lançamento falhar, a presença também não vale.
   */
  async awardAttendance(
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
