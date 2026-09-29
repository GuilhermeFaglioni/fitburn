import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  dateOnlyToLocalDate,
  type ClientListItem,
  type ClientOverview,
  type ClientsQuery,
  type CreateClientRequest,
  type UpdateClientRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { GamificationService } from "../gamification/gamification.service.js";
import {
  assertClientInScope,
  CLIENT_PROFILE_WHERE,
  clientScopeFilter,
} from "../permissions/client-scope.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { PlansService } from "../plans/plans.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReservationsService } from "../reservations/reservations.service.js";
import { UsersService } from "../users/users.service.js";
import { WorkoutSheetsService } from "../workout-sheets/workout-sheets.service.js";

/**
 * Clientes: a visão operacional da equipe sobre os usuários do perfil
 * Cliente. Lista e detalhe respeitam o escopo do perfil; cadastro, edição,
 * desativação e reativação reaproveitam as regras de usuários. Desativar
 * não cancela as reservas existentes: a equipe decide o que fazer com elas.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly reservationsService: ReservationsService,
    private readonly gamificationService: GamificationService,
    private readonly workoutSheetsService: WorkoutSheetsService,
  ) {}

  async list(query: ClientsQuery, requester: ScopedRequester): Promise<ClientListItem[]> {
    const conditions: Prisma.UserWhereInput[] = [
      CLIENT_PROFILE_WHERE,
      clientScopeFilter(requester),
    ];
    if (query.status) conditions.push({ status: query.status });
    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" } as const;
      conditions.push({
        OR: [{ fullName: contains }, { email: contains }, { document: contains }],
      });
    }

    const clients = await this.prisma.user.findMany({
      where: { AND: conditions },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        document: true,
        status: true,
        planAssignments: {
          where: this.plansService.currentWhere(),
          select: { endDate: true, plan: { select: { name: true } } },
          orderBy: { startDate: "desc" },
          take: 1,
        },
      },
      orderBy: { fullName: "asc" },
    });

    return clients.map(({ planAssignments, ...client }) => ({
      ...client,
      activePlan: planAssignments[0]
        ? {
            name: planAssignments[0].plan.name,
            endDate: dateOnlyToLocalDate(planAssignments[0].endDate),
          }
        : null,
    }));
  }

  async overview(id: string, requester: ScopedRequester): Promise<ClientOverview> {
    await assertClientInScope(this.prisma, id, requester);
    const [user, plan, upcomingReservations, pastReservations, gamification, workoutSheets] =
      await Promise.all([
        this.usersService.findById(id),
        this.plansService.mine(id),
        this.reservationsService.listMine(id, { when: "upcoming" }),
        this.reservationsService.listMine(id, { when: "past" }),
        this.gamificationService.summaryOf(id),
        this.workoutSheetsService.listMine(id),
      ]);

    return {
      client: this.usersService.toUserDetail(user!),
      plan,
      upcomingReservations,
      pastReservations,
      gamification,
      workoutSheets,
    };
  }

  async create(input: CreateClientRequest, requester: ScopedRequester): Promise<UserDetail> {
    assertFullScope(requester, "Só quem tem acesso a todos os clientes cadastra clientes.");
    return this.usersService.toUserDetail(await this.usersService.createClient(input));
  }

  async update(
    id: string,
    input: UpdateClientRequest,
    requester: ScopedRequester,
  ): Promise<UserDetail> {
    await assertClientInScope(this.prisma, id, requester);
    return this.usersService.toUserDetail(await this.usersService.update(id, input));
  }

  async deactivate(id: string, requester: ScopedRequester): Promise<UserDetail> {
    await assertClientInScope(this.prisma, id, requester);
    return this.usersService.toUserDetail(await this.usersService.deactivate(id));
  }

  async reactivate(id: string, requester: ScopedRequester): Promise<UserDetail> {
    await assertClientInScope(this.prisma, id, requester);
    return this.usersService.toUserDetail(await this.usersService.reactivate(id));
  }
}
