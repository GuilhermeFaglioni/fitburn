import { useQuery } from "@tanstack/react-query";
import { RankingPeriod, type Dashboard, type DashboardOccupancyItem } from "@fitburn/contracts";
import { getDashboard } from "../lib/dashboard/api";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

/** Quantas posições do ranking o painel mostra (o artboard tem 3). */
const RANKING_ROWS = 3;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Reservas sobre vagas, em porcentagem inteira. */
function percent(booked: number, capacity: number): number {
  return capacity > 0 ? Math.round((booked / capacity) * 100) : 0;
}

interface ClassOccupancy {
  name: string;
  percent: number;
}

/** Ocupação por modalidade na semana atual: as reservas sobre as vagas de todas as aulas do mesmo nome. */
function occupancyByClass(week: DashboardOccupancyItem[]): ClassOccupancy[] {
  const totals = new Map<string, { booked: number; capacity: number }>();
  for (const item of week) {
    const current = totals.get(item.name) ?? { booked: 0, capacity: 0 };
    totals.set(item.name, {
      booked: current.booked + item.booked,
      capacity: current.capacity + item.capacity,
    });
  }
  return [...totals.entries()]
    .map(([name, { booked, capacity }]) => ({ name, percent: percent(booked, capacity) }))
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, "pt-BR"));
}

/** A ocupação média da semana: todas as reservas sobre todas as vagas das aulas da semana. */
function weekOccupancy(week: DashboardOccupancyItem[]): string {
  const capacity = week.reduce((sum, item) => sum + item.capacity, 0);
  if (capacity === 0) return "—";
  const booked = week.reduce((sum, item) => sum + item.booked, 0);
  return `${percent(booked, capacity)}%`;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="fb-dash__kpi">
      <span className="fb-dash__kpi-label">{label}</span>
      <span className="fb-dash__kpi-value">{value}</span>
    </div>
  );
}

function OccupancyPanel({ week }: { week: DashboardOccupancyItem[] }) {
  const classes = occupancyByClass(week);
  return (
    <section className="fb-dash__panel" aria-labelledby="fb-dash-occupancy">
      <h2 id="fb-dash-occupancy" className="fb-dash__panel-title">
        Ocupação por aula · semana atual
      </h2>
      {classes.length === 0 ? (
        <EmptyState message="Nenhuma aula nesta semana." />
      ) : (
        <ul className="fb-dash__bars" aria-label="Ocupação por aula">
          {classes.map((item) => (
            <li key={item.name} className="fb-dash__bar-row">
              <div className="fb-dash__bar-head">
                <span className="fb-dash__bar-name">{item.name}</span>
                <span className="fb-dash__bar-value">{item.percent}%</span>
              </div>
              <div className="fb-dash__meter-track" aria-hidden="true">
                <div className="fb-dash__meter-fill" style={{ width: `${item.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GamificationPanel({
  gamification,
}: {
  gamification: NonNullable<Dashboard["gamification"]>;
}) {
  return (
    <section className="fb-dash__panel" aria-labelledby="fb-dash-gamification">
      <h2 id="fb-dash-gamification" className="fb-dash__panel-title">
        Gamificação
      </h2>
      <div className="fb-dash__figures">
        <div className="fb-dash__figure">
          <span className="fb-dash__figure-value">
            {formatNumber(gamification.pointsDistributed)}
          </span>
          <span className="fb-dash__figure-label">pontos distribuídos</span>
        </div>
        <div className="fb-dash__figure">
          <span className="fb-dash__figure-value">
            {formatNumber(gamification.clientsWithActiveStreak)}
          </span>
          <span className="fb-dash__figure-label">streaks ativos</span>
        </div>
      </div>
      <div className="fb-dash__divider" role="presentation" />
      <div className="fb-dash__ranking">
        <h3 className="fb-dash__ranking-title">Ranking do período</h3>
        {gamification.top.length === 0 ? (
          <EmptyState message="Ninguém pontuou neste período." />
        ) : (
          <ol className="fb-dash__ranking-list" aria-label="Topo do ranking">
            {gamification.top.slice(0, RANKING_ROWS).map((entry) => (
              <li key={entry.clientId} className="fb-dash__ranking-row">
                <span className="fb-dash__ranking-pos">{entry.position}º</span>
                <span className="fb-dash__ranking-name">{entry.fullName}</span>
                <span className="fb-dash__ranking-count">
                  {plural(entry.attendances, "presença", "presenças")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/**
 * Dashboard administrativo (DashboardAdmin.dc.html): quatro cartões de KPI (clientes ativos, ocupação
 * média da semana, pontos distribuídos e streaks ativos no mês), o painel "Ocupação por aula" com uma
 * barra por modalidade na semana atual e o painel "Gamificação" com o ranking do mês. Cada bloco só
 * chega quando a pessoa enxerga o módulo que o alimenta, já limitado ao escopo dela.
 */
export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", RankingPeriod.MONTH],
    queryFn: () => getDashboard(RankingPeriod.MONTH),
  });
  const dashboard = dashboardQuery.data;

  return (
    <div className="fb-dash">
      <div className="fb-dash__heading">
        <h1 className="fb-page-title">Dashboard</h1>
        <span className="fb-dash__subtitle">Visão geral do Fitburn</span>
      </div>

      {dashboardQuery.isLoading && <LoadingState />}
      {dashboardQuery.isError && (
        <ErrorState
          message="Não foi possível carregar o dashboard."
          onRetry={() => void dashboardQuery.refetch()}
        />
      )}

      {dashboard && (
        <>
          <div className="fb-dash__kpis">
            {dashboard.activeClients && (
              <Kpi label="Clientes ativos" value={formatNumber(dashboard.activeClients.total)} />
            )}
            {dashboard.occupancy && (
              <Kpi
                label="Ocupação média da semana"
                value={weekOccupancy(dashboard.occupancy.week)}
              />
            )}
            {dashboard.gamification && (
              <>
                <Kpi
                  label="Pontos distribuídos no mês"
                  value={formatNumber(dashboard.gamification.pointsDistributed)}
                />
                <Kpi
                  label="Streaks ativos"
                  value={formatNumber(dashboard.gamification.clientsWithActiveStreak)}
                />
              </>
            )}
          </div>

          {(dashboard.occupancy || dashboard.gamification) && (
            <div className="fb-dash__panels">
              {dashboard.occupancy && <OccupancyPanel week={dashboard.occupancy.week} />}
              {dashboard.gamification && <GamificationPanel gamification={dashboard.gamification} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
