import { Injectable } from "@nestjs/common";
import type { Goal, Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  GoalStatus,
  type ClientSummary,
  type CreateGoalRequest,
  type GoalDetail,
  type GoalStatusName,
  type UpdateGoalRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { GamificationService } from "../gamification/gamification.service.js";
import {
  ACTIVE_CLIENT_WHERE,
  assertClientInScope,
  clientScopeFilter,
} from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";

const STATUS_ORDER: Record<GoalStatusName, number> = {
  [GoalStatus.ACTIVE]: 0,
  [GoalStatus.COMPLETED]: 1,
  [GoalStatus.CANCELLED]: 2,
};

/**
 * Ativas primeiro (as de prazo mais próximo antes), depois as concluídas (as
 * mais recentes antes) e as canceladas.
 */
function orderGoals(goals: Goal[]): Goal[] {
  const soonest = (goal: Goal) => goal.dueDate?.getTime() ?? Infinity;
  const latestConclusion = (goal: Goal) => -(goal.concludedAt?.getTime() ?? 0);
  return [...goals].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.status === GoalStatus.COMPLETED
        ? latestConclusion(a) - latestConclusion(b)
        : soonest(a) - soonest(b)) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/**
 * Metas individuais: a equipe cria metas para os clientes do seu escopo e as
 * conclui; concluir lança os pontos da regra GOAL_POINTS no ledger, na mesma
 * transação. Uma meta concluída ou cancelada não muda mais: as alterações são
 * condicionais ao estado "ativa" no próprio UPDATE, então duas conclusões
 * simultâneas não pagam duas vezes.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  /** Os clientes ativos do escopo de quem pede: a lista "meus alunos" da tela de metas. */
  async clientsInScope(requester: ScopedRequester): Promise<ClientSummary[]> {
    return this.prisma.user.findMany({
      where: { AND: [ACTIVE_CLIENT_WHERE, clientScopeFilter(requester)] },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    });
  }

  async listForClient(clientId: string, requester: ScopedRequester): Promise<GoalDetail[]> {
    await assertClientInScope(this.prisma, clientId, requester);
    const goals = await this.prisma.goal.findMany({ where: { clientId } });
    return orderGoals(goals).map((goal) => this.toDetail(goal));
  }

  /** As metas do próprio cliente: ativas e concluídas (as canceladas não aparecem para ele). */
  async listMine(clientId: string): Promise<GoalDetail[]> {
    const goals = await this.prisma.goal.findMany({
      where: { clientId, status: { not: GoalStatus.CANCELLED } },
    });
    return orderGoals(goals).map((goal) => this.toDetail(goal));
  }

  async create(
    input: CreateGoalRequest,
    creatorId: string,
    requester: ScopedRequester,
  ): Promise<GoalDetail> {
    await assertClientInScope(this.prisma, input.clientId, requester);
    const goal = await this.prisma.goal.create({
      data: {
        clientId: input.clientId,
        createdById: creatorId,
        title: input.title,
        description: input.description || null,
        dueDate: this.toDueDate(input.dueDate),
      },
    });
    return this.toDetail(goal);
  }

  async update(
    id: string,
    input: UpdateGoalRequest,
    requester: ScopedRequester,
  ): Promise<GoalDetail> {
    await this.assertGoalInScope(id, requester);
    return this.applyIfActive(id, {
      title: input.title,
      description: input.description === undefined ? undefined : input.description || null,
      dueDate: input.dueDate === undefined ? undefined : this.toDueDate(input.dueDate),
    });
  }

  async cancel(id: string, requester: ScopedRequester): Promise<GoalDetail> {
    await this.assertGoalInScope(id, requester);
    return this.applyIfActive(id, { status: GoalStatus.CANCELLED });
  }

  /** Conclui a meta e lança os pontos dela, na mesma transação. */
  async complete(id: string, requester: ScopedRequester): Promise<GoalDetail> {
    await this.assertGoalInScope(id, requester);
    return this.applyIfActive(
      id,
      { status: GoalStatus.COMPLETED, concludedAt: new Date() },
      (tx, goal) =>
        this.gamification.awardGoal(tx, {
          clientId: goal.clientId,
          goalId: goal.id,
          // A data do evento é a da conclusão: é nela que o ranking do período conta.
          occurredAt: goal.concludedAt!,
        }),
    );
  }

  /**
   * Aplica a alteração só se a meta ainda está ativa — a condição vai no
   * próprio UPDATE, então duas alterações simultâneas não passam as duas — e
   * roda `afterApply` na mesma transação. Se nada mudou, explica por quê: a
   * meta já foi concluída ou foi cancelada.
   */
  private async applyIfActive(
    id: string,
    data: Prisma.GoalUpdateManyMutationInput,
    afterApply?: (tx: Prisma.TransactionClient, goal: Goal) => Promise<void>,
  ): Promise<GoalDetail> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.goal.updateMany({
        where: { id, status: GoalStatus.ACTIVE },
        data,
      });
      const goal = await tx.goal.findUniqueOrThrow({ where: { id } });
      if (count === 0) {
        throw goal.status === GoalStatus.COMPLETED
          ? new DomainError(
              ErrorCode.GOAL_ALREADY_CONCLUDED,
              "Esta meta já foi concluída e não pode mais ser alterada.",
              ErrorStatus.CONFLICT,
            )
          : new DomainError(
              ErrorCode.GOAL_NOT_ACTIVE,
              "Esta meta foi cancelada e não pode mais ser alterada.",
              ErrorStatus.CONFLICT,
            );
      }
      await afterApply?.(tx, goal);
      return this.toDetail(goal);
    });
  }

  private async assertGoalInScope(id: string, requester: ScopedRequester): Promise<Goal> {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Meta não encontrada.", ErrorStatus.NOT_FOUND);
    }
    await assertClientInScope(this.prisma, goal.clientId, requester);
    return goal;
  }

  /** "2026-10-30" → esse dia (UTC 00h00) para a coluna DATE; sem prazo, null. */
  private toDueDate(dueDate: string | null | undefined): Date | null {
    return dueDate ? new Date(dueDate) : null;
  }

  private toDetail(goal: Goal): GoalDetail {
    return {
      id: goal.id,
      clientId: goal.clientId,
      title: goal.title,
      description: goal.description,
      dueDate: goal.dueDate?.toISOString().slice(0, 10) ?? null,
      status: goal.status,
      concludedAt: goal.concludedAt?.toISOString() ?? null,
      createdAt: goal.createdAt.toISOString(),
    };
  }
}
