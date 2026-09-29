import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";
import {
  dateOnlyToLocalDate,
  type ClientDetail,
  type ClientListItem,
  type ClientPlan,
  type ClientsQuery,
  type CreateClientRequest,
  type GamificationSummary,
  type MyReservationsQuery,
  type ReservationDetail,
  type UpdateClientRequest,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  assertClientInScope,
  CLIENT_PROFILE_WHERE,
  clientScopeFilter,
} from "../permissions/client-scope.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { GamificationService } from "../gamification/gamification.service.js";
import { PlansService } from "../plans/plans.service.js";
import { ReservationsService } from "../reservations/reservations.service.js";
import { UsersService } from "../users/users.service.js";
import { WorkoutSheetsService } from "../workout-sheets/workout-sheets.service.js";

/**
 * Tela de Clientes: a visão operacional da equipe sobre os usuários do perfil
 * Cliente. Os dados pessoais e o ciclo de vida (cadastro, edição, desativar e
 * reativar) continuam sendo do UsersService; os planos, as reservas, a
 * gamificação e as fichas de cada aba do detalhe vêm dos serviços dos
 * respectivos módulos — aqui só se decide quem a equipe pode enxergar.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
    private readonly reservationsService: ReservationsService,
    private readonly gamificationService: GamificationService,
    private readonly workoutSheetsService: WorkoutSheetsService,
    private readonly usersService: UsersService,
  ) {}

  async list(query: ClientsQuery, requester: ScopedRequester): Promise<ClientListItem[]> {
    const clients = await this.prisma.user.findMany({
      where: this.listableWhere(query, requester),
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    });
    const activePlans = await this.plansService.activePlansOf(clients.map((client) => client.id));
    return clients.map((client) => this.toListItem(client, activePlans.get(client.id) ?? null));
  }

  /** Dados pessoais e situação de um cliente do escopo (aba "Dados pessoais"). */
  async detail(clientId: string, requester: ScopedRequester): Promise<ClientDetail> {
    await assertClientInScope(this.prisma, clientId, requester);
    return this.detailOf(clientId);
  }

  /**
   * Cadastra um cliente. Exige acesso a todos os clientes: quem só enxerga os
   * seus criaria um cliente que não poderia mais ver.
   */
  async create(input: CreateClientRequest, requester: ScopedRequester): Promise<ClientDetail> {
    assertFullScope(requester, "Só quem tem acesso a todos os clientes cadastra um cliente.");
    const created = await this.usersService.createClient(input);
    return this.detailOf(created.id);
  }

  /** Edita os dados pessoais de um cliente do escopo. */
  async update(
    clientId: string,
    input: UpdateClientRequest,
    requester: ScopedRequester,
  ): Promise<ClientDetail> {
    await assertClientInScope(this.prisma, clientId, requester);
    await this.usersService.update(clientId, input);
    return this.detailOf(clientId);
  }

  /**
   * Desativa o cliente: ele não entra nem reserva mais e as sessões acabam.
   * As reservas existentes ficam como estão — a equipe decide o que fazer com
   * elas (o cancelamento é uma ação à parte, das reservas administrativas, #44).
   */
  async deactivate(clientId: string, requester: ScopedRequester): Promise<ClientDetail> {
    await assertClientInScope(this.prisma, clientId, requester);
    await this.usersService.deactivate(clientId);
    return this.detailOf(clientId);
  }

  async reactivate(clientId: string, requester: ScopedRequester): Promise<ClientDetail> {
    await assertClientInScope(this.prisma, clientId, requester);
    await this.usersService.reactivate(clientId);
    return this.detailOf(clientId);
  }

  /** O plano ativo e o histórico do cliente (aba "Plano e histórico"). */
  async plan(clientId: string, requester: ScopedRequester): Promise<ClientPlan> {
    await assertClientInScope(this.prisma, clientId, requester);
    return this.plansService.mine(clientId);
  }

  /** Reservas do cliente, próximas ou anteriores (aba "Reservas"). */
  async reservations(
    clientId: string,
    query: MyReservationsQuery,
    requester: ScopedRequester,
  ): Promise<ReservationDetail[]> {
    await assertClientInScope(this.prisma, clientId, requester);
    return this.reservationsService.listMine(clientId, query);
  }

  /** Pontos, streak e badges do cliente (aba "Gamificação"). */
  async gamification(clientId: string, requester: ScopedRequester): Promise<GamificationSummary> {
    return this.gamificationService.summaryForStaff(clientId, requester);
  }

  /** Fichas de treino do cliente (aba "Fichas"). */
  workoutSheets(clientId: string, requester: ScopedRequester): Promise<WorkoutSheet[]> {
    return this.workoutSheetsService.listForClient(clientId, requester);
  }

  private async detailOf(clientId: string): Promise<ClientDetail> {
    const client = await this.prisma.user.findUniqueOrThrow({ where: { id: clientId } });
    const activePlans = await this.plansService.activePlansOf([clientId]);
    return {
      ...this.toListItem(client, activePlans.get(clientId) ?? null),
      birthDate: client.birthDate ? dateOnlyToLocalDate(client.birthDate) : null,
      address: client.address,
      createdAt: client.createdAt.toISOString(),
    };
  }

  /**
   * Quem a lista mostra: clientes do escopo de quem pede, com a busca e o
   * status. Ponto único da regra "quem aparece na tela": a exclusão com
   * anonimização (#43) acrescenta aqui a saída dos excluídos.
   */
  private listableWhere(query: ClientsQuery, requester: ScopedRequester): Prisma.UserWhereInput {
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
    return { AND: conditions };
  }

  private toListItem(
    client: User,
    activePlan: { name: string; endDate: string } | null,
  ): ClientListItem {
    return {
      id: client.id,
      fullName: client.fullName,
      email: client.email,
      phone: client.phone,
      document: client.document,
      status: client.status,
      activePlan,
    };
  }
}
