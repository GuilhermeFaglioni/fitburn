import { Injectable } from "@nestjs/common";
import type { Plan, PlanAssignment as PlanAssignmentRow, Prisma } from "@prisma/client";
import {
  addDays,
  ErrorCode,
  ErrorStatus,
  gymToday,
  PlanAssignmentStatus,
  type AssignPlanRequest,
  type CreatePlanRequest,
  type MyPlan,
  type PlanAssignment,
  type PlanAssignmentOptions,
  type PlanDetail,
  type UpdatePlanRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { ACTIVE_CLIENT_WHERE, assertIsActiveClient } from "../permissions/client-scope.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";

const ASSIGNMENT_INCLUDE = {
  plan: { select: { id: true, name: true, description: true } },
} satisfies Prisma.PlanAssignmentInclude;

type AssignmentWithPlan = Prisma.PlanAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

const FULL_SCOPE_MESSAGE = "Só quem tem acesso a todos os clientes gerencia planos.";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Planos: o catálogo mantido pela administração e as atribuições dele aos
 * clientes. Um plano é informativo no MVP (não bloqueia reserva nem tem
 * preço). Um cliente tem no máximo uma atribuição ativa: atribuir outra
 * encerra a anterior na mesma transação, e o índice único parcial do banco é a
 * última defesa. Uma atribuição ativa cuja data de término já passou vale como
 * encerrada nas respostas (não há rotina que a feche no banco).
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** O catálogo, com quantos clientes têm cada plano ativo agora. */
  async list(requester: ScopedRequester): Promise<PlanDetail[]> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    const [plans, counts] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: { name: "asc" } }),
      this.prisma.planAssignment.groupBy({
        by: ["planId"],
        where: this.currentWhere(),
        _count: { _all: true },
      }),
    ]);
    const activeClients = new Map(counts.map((row) => [row.planId, row._count._all]));
    return plans.map((plan) => this.toDetail(plan, activeClients.get(plan.id) ?? 0));
  }

  async create(input: CreatePlanRequest, requester: ScopedRequester): Promise<PlanDetail> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    await this.assertNameAvailable(input.name);
    const plan = await this.prisma.plan.create({
      data: { name: input.name, description: input.description || null },
    });
    return this.toDetail(plan, 0);
  }

  async update(
    id: string,
    input: UpdatePlanRequest,
    requester: ScopedRequester,
  ): Promise<PlanDetail> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    await this.findPlanOrThrow(id);
    if (input.name !== undefined) await this.assertNameAvailable(input.name, id);
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description || null,
      },
    });
    return this.detailWithCount(plan);
  }

  async setActive(id: string, isActive: boolean, requester: ScopedRequester): Promise<PlanDetail> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    await this.findPlanOrThrow(id);
    const plan = await this.prisma.plan.update({ where: { id }, data: { isActive } });
    return this.detailWithCount(plan);
  }

  /** Planos ativos e clientes ativos (com o plano ativo de cada um), para o formulário de atribuição. */
  async options(requester: ScopedRequester): Promise<PlanAssignmentOptions> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    const [plans, clients] = await Promise.all([
      this.prisma.plan.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.user.findMany({
        where: ACTIVE_CLIENT_WHERE,
        select: {
          id: true,
          fullName: true,
          email: true,
          planAssignments: {
            where: this.currentWhere(),
            select: { endDate: true, plan: { select: { name: true } } },
          },
        },
        orderBy: { fullName: "asc" },
      }),
    ]);
    return {
      plans,
      clients: clients.map((client) => {
        const current = client.planAssignments[0];
        return {
          id: client.id,
          fullName: client.fullName,
          email: client.email,
          activePlan: current
            ? { name: current.plan.name, endDate: isoDay(current.endDate) }
            : null,
        };
      }),
    };
  }

  /**
   * Atribui um plano a um cliente e encerra o ativo anterior, tudo numa
   * transação. O lock por cliente serializa atribuições simultâneas: sem ele
   * a segunda não veria a ativa que a primeira acabou de criar (e o índice
   * único parcial do banco, a última defesa, a recusaria).
   */
  async assign(input: AssignPlanRequest, requester: ScopedRequester): Promise<PlanAssignment> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    await assertIsActiveClient(this.prisma, input.clientId);

    return this.prisma.$transaction(async (tx) => {
      await lockAdvisory(tx, `plan-client:${input.clientId}`);
      const plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan) throw this.notFound("Plano não encontrado.");
      if (!plan.isActive) {
        throw new DomainError(
          ErrorCode.PLAN_INACTIVE,
          "Este plano está inativo e não pode ser atribuído.",
          ErrorStatus.UNPROCESSABLE,
        );
      }

      const current = await tx.planAssignment.findMany({
        where: { clientId: input.clientId, status: PlanAssignmentStatus.ACTIVE },
      });
      for (const previous of current) {
        await tx.planAssignment.update({
          where: { id: previous.id },
          data: {
            status: PlanAssignmentStatus.ENDED,
            endDate: this.endedOn(previous, input.startDate),
          },
        });
      }

      const created = await tx.planAssignment.create({
        data: {
          clientId: input.clientId,
          planId: input.planId,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
        include: ASSIGNMENT_INCLUDE,
      });
      return this.toAssignment(created, gymToday());
    });
  }

  /** Todas as atribuições de um cliente, da mais recente para a mais antiga (consulta da administração). */
  async historyOf(clientId: string, requester: ScopedRequester): Promise<PlanAssignment[]> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    const today = gymToday();
    const rows = await this.assignmentsOf(clientId);
    return rows.map((row) => this.toAssignment(row, today));
  }

  /** O plano do próprio cliente: o ativo (ou nenhum) e o histórico. */
  async mine(clientId: string): Promise<MyPlan> {
    const today = gymToday();
    const all = (await this.assignmentsOf(clientId)).map((row) => this.toAssignment(row, today));
    const active = all.find((item) => item.status === PlanAssignmentStatus.ACTIVE) ?? null;
    return { active, history: all.filter((item) => item !== active) };
  }

  private assignmentsOf(clientId: string): Promise<AssignmentWithPlan[]> {
    return this.prisma.planAssignment.findMany({
      where: { clientId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
  }

  /** Atribuições ativas que ainda valem hoje (o término não passou). */
  private currentWhere(): Prisma.PlanAssignmentWhereInput {
    return { status: PlanAssignmentStatus.ACTIVE, endDate: { gte: new Date(gymToday()) } };
  }

  /**
   * Quando a atribuição encerrada passa a acabar: na véspera do plano novo, se
   * isso a encurta (e não a deixa acabar antes de começar); senão, como estava.
   */
  private endedOn(previous: PlanAssignmentRow, newStartDate: string): Date {
    const eve = addDays(newStartDate, -1);
    return eve < isoDay(previous.endDate) && eve >= isoDay(previous.startDate)
      ? new Date(eve)
      : previous.endDate;
  }

  private async findPlanOrThrow(id: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw this.notFound("Plano não encontrado.");
    return plan;
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.plan.findUnique({ where: { name } });
    if (existing && existing.id !== exceptId) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Já existe um plano com este nome.",
        ErrorStatus.VALIDATION,
      );
    }
  }

  private async detailWithCount(plan: Plan): Promise<PlanDetail> {
    const activeClients = await this.prisma.planAssignment.count({
      where: { planId: plan.id, ...this.currentWhere() },
    });
    return this.toDetail(plan, activeClients);
  }

  private notFound(message: string): DomainError {
    return new DomainError(ErrorCode.NOT_FOUND, message, ErrorStatus.NOT_FOUND);
  }

  private toDetail(plan: Plan, activeClientCount: number): PlanDetail {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      isActive: plan.isActive,
      activeClientCount,
    };
  }

  private toAssignment(row: AssignmentWithPlan, today: string): PlanAssignment {
    const endDate = isoDay(row.endDate);
    return {
      id: row.id,
      plan: row.plan,
      startDate: isoDay(row.startDate),
      endDate,
      status:
        row.status === PlanAssignmentStatus.ACTIVE && endDate >= today
          ? PlanAssignmentStatus.ACTIVE
          : PlanAssignmentStatus.ENDED,
    };
  }
}
