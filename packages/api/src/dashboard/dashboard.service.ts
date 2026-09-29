import { Injectable } from "@nestjs/common";
import type { AccessProfile, Prisma } from "@prisma/client";
import {
  addDays,
  gymDateTimeToUtc,
  gymToday,
  Module,
  OccurrenceStatus,
  PermissionAction,
  PermissionScope,
  PointsEntryType,
  ReservationStatus,
  startOfWeek,
  type Dashboard,
  type DashboardOccupancyItem,
  type ModuleName,
  type RankingPeriodName,
} from "@fitburn/contracts";
import { occurrenceScopeFilter } from "../agenda/occurrence-scope.js";
import { GamificationService } from "../gamification/gamification.service.js";
import { rankingWindow } from "../gamification/ranking.js";
import {
  ACTIVE_CLIENT_WHERE,
  clientScopeFilter,
  HISTORICAL_CLIENT_WHERE,
} from "../permissions/client-scope.js";
import { PermissionsService } from "../permissions/permissions.service.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Quantos clientes o topo do ranking do dashboard traz. */
const TOP_SIZE = 5;

/**
 * Dashboard da equipe. A rota exige acesso ao módulo Dashboard; cada bloco só
 * aparece se a pessoa também enxerga o módulo que o alimenta e sempre dentro
 * do escopo que o perfil tem nele.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly gamification: GamificationService,
  ) {}

  async get(
    profile: AccessProfile,
    userId: string,
    period: RankingPeriodName,
    now = new Date(),
  ): Promise<Dashboard> {
    const today = gymToday(now);
    const window = rankingWindow(period, today);

    const [occupancy, clients, gamification] = await Promise.all([
      this.viewerOf(profile, userId, Module.OCORRENCIAS),
      this.viewerOf(profile, userId, Module.CLIENTES),
      this.viewerOf(profile, userId, Module.GAMIFICACAO),
    ]);

    // Os três blocos são independentes: consultam juntos.
    const [occupancyBlock, activeClientsBlock, gamificationBlock] = await Promise.all([
      occupancy ? this.occupancy(occupancy, today) : null,
      clients ? this.activeClients(clients) : null,
      gamification ? this.gamificationBlock(gamification, window) : null,
    ]);
    return {
      period,
      ...window,
      today,
      occupancy: occupancyBlock,
      activeClients: activeClientsBlock,
      gamification: gamificationBlock,
    };
  }

  /** Quem vê o módulo, com o escopo que tem nele; null se não tem VIEW. */
  private async viewerOf(
    profile: AccessProfile,
    userId: string,
    module: ModuleName,
  ): Promise<ScopedRequester | null> {
    if (!(await this.permissions.hasPermission(profile, module, PermissionAction.VIEW)))
      return null;
    return { userId, scope: await this.permissions.getEffectiveScope(profile, module) };
  }

  private async occupancy(viewer: ScopedRequester, today: string): Promise<Dashboard["occupancy"]> {
    // Clientes atribuídos não tem sentido para aulas: sem aulas para mostrar.
    if (viewer.scope === PermissionScope.ASSIGNED_CLIENTS) return null;

    const weekStart = startOfWeek(today);
    const occurrences = await this.prisma.classOccurrence.findMany({
      where: {
        AND: [
          occurrenceScopeFilter(viewer),
          {
            status: OccurrenceStatus.SCHEDULED,
            startsAt: {
              gte: gymDateTimeToUtc(weekStart, "00:00"),
              lt: gymDateTimeToUtc(addDays(weekStart, 7), "00:00"),
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        startsAt: true,
        capacity: true,
        _count: {
          select: { reservations: { where: { status: { not: ReservationStatus.CANCELLED } } } },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const todayStart = gymDateTimeToUtc(today, "00:00");
    const tomorrowStart = gymDateTimeToUtc(addDays(today, 1), "00:00");
    const items = occurrences.map((occurrence) => ({
      startsAt: occurrence.startsAt,
      item: {
        id: occurrence.id,
        name: occurrence.name,
        startsAt: occurrence.startsAt.toISOString(),
        capacity: occurrence.capacity,
        booked: occurrence._count.reservations,
        availableSpots: Math.max(0, occurrence.capacity - occurrence._count.reservations),
      } satisfies DashboardOccupancyItem,
    }));
    return {
      today: items
        .filter(({ startsAt }) => startsAt >= todayStart && startsAt < tomorrowStart)
        .map(({ item }) => item),
      week: items.map(({ item }) => item),
    };
  }

  private async activeClients(viewer: ScopedRequester): Promise<Dashboard["activeClients"]> {
    return {
      total: await this.prisma.user.count({
        where: { AND: [ACTIVE_CLIENT_WHERE, clientScopeFilter(viewer)] },
      }),
    };
  }

  private async gamificationBlock(
    viewer: ScopedRequester,
    window: { from: string; to: string },
  ): Promise<Dashboard["gamification"]> {
    const clientWhere: Prisma.UserWhereInput = {
      AND: [ACTIVE_CLIENT_WHERE, clientScopeFilter(viewer)],
    };
    // Pontos e presenças do período são histórico: continuam contando para
    // quem foi excluído. Streak e topo do ranking são do momento: só ativos.
    const historicalWhere: Prisma.UserWhereInput = {
      AND: [HISTORICAL_CLIENT_WHERE, clientScopeFilter(viewer)],
    };
    const occurredAt = {
      gte: gymDateTimeToUtc(window.from, "00:00"),
      lt: gymDateTimeToUtc(addDays(window.to, 1), "00:00"),
    };

    const [points, attendances, clientsWithActiveStreak, standings] = await Promise.all([
      this.prisma.pointsEntry.aggregate({
        where: { occurredAt, client: historicalWhere },
        _sum: { points: true },
      }),
      this.prisma.pointsEntry.count({
        where: {
          occurredAt,
          type: PointsEntryType.ATTENDANCE,
          reversedBy: null,
          client: historicalWhere,
        },
      }),
      this.countActiveStreaks(clientWhere),
      this.gamification.standings(window, clientWhere),
    ]);

    return {
      pointsDistributed: points._sum.points ?? 0,
      attendances,
      clientsWithActiveStreak,
      top: standings.slice(0, TOP_SIZE).map((standing) => ({
        clientId: standing.clientId,
        position: standing.position,
        fullName: standing.fullName,
        points: standing.points,
        attendances: standing.attendances,
        tied: standing.tied,
      })),
    };
  }

  /**
   * Quantos clientes têm streak ativo: a última marcação (presença ou falta),
   * na mesma ordem do streak do cliente (aula, criação, id), é uma presença.
   * O banco escolhe a última marcação de cada cliente (DISTINCT ON), sem
   * trazer o histórico inteiro para a memória.
   */
  private async countActiveStreaks(clientWhere: Prisma.UserWhereInput): Promise<number> {
    const clients = await this.prisma.user.findMany({ where: clientWhere, select: { id: true } });
    if (clients.length === 0) return 0;
    const clientIds = clients.map((client) => client.id);
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM (
        SELECT DISTINCT ON (r."clientId") r.status::text AS status
        FROM reservations r
        JOIN class_occurrences o ON o.id = r."occurrenceId"
        WHERE r."clientId" = ANY(${clientIds}::text[])
          AND r.status::text IN (${ReservationStatus.COMPLETED}, ${ReservationStatus.NO_SHOW})
        ORDER BY r."clientId", o."startsAt" DESC, r."createdAt" DESC, r.id DESC
      ) latest
      WHERE latest.status = ${ReservationStatus.COMPLETED}
    `;
    return rows[0]?.count ?? 0;
  }
}
