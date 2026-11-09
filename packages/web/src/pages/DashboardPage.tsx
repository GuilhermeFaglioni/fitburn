import { useQuery } from "@tanstack/react-query";
import { RankingPeriod, type Dashboard, type DashboardOccupancyItem } from "@fitburn/contracts";
import { getDashboard } from "../lib/dashboard/api";
import { QueryBlockState } from "../components/QueryBlockState";
import { Card } from "../components/ui/Card";
import { Meter } from "../components/ui/Meter";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/States";

/** Quantas posições do ranking o painel mostra (a tela de referência tem 3). */
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
    <Card className="fb-ui-kpi">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </Card>
  );
}

function OccupancyPanel({ week }: { week: DashboardOccupancyItem[] }) {
  const classes = occupancyByClass(week);
  return (
    <Card as="section" aria-labelledby="dashboard-occupancy" className="fb-ui-dash-panel">
      <h2 id="dashboard-occupancy" className="fb-ui-dash-panel__title">
        Ocupação por aula · semana atual
      </h2>
      {classes.length === 0 ? (
        <EmptyState title="Nenhuma aula nesta semana." />
      ) : (
        <ul className="fb-ui-dash-bars" aria-label="Ocupação por aula">
          {classes.map((item) => (
            <li key={item.name}>
              <span className="fb-ui-dash-bars__name">{item.name}</span>
              <Meter value={item.percent} max={100} label={`${item.name}: ${item.percent}%`} />
              <span className="fb-ui-dash-bars__value">{item.percent}%</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GamificationPanel({
  gamification,
}: {
  gamification: NonNullable<Dashboard["gamification"]>;
}) {
  return (
    <Card as="section" aria-labelledby="dashboard-gamification" className="fb-ui-dash-panel">
      <h2 id="dashboard-gamification" className="fb-ui-dash-panel__title">
        FitPoints
      </h2>
      <dl className="fb-ui-dash-figures">
        <div>
          <dt>pontos distribuídos</dt>
          <dd>{formatNumber(gamification.pointsDistributed)}</dd>
        </div>
        <div>
          <dt>streaks ativos</dt>
          <dd>{formatNumber(gamification.clientsWithActiveStreak)}</dd>
        </div>
      </dl>
      <div className="fb-ui-dash-ranking">
        <h3 className="fb-ui-dash-ranking__title">Ranking do período</h3>
        {gamification.top.length === 0 ? (
          <EmptyState title="Ninguém pontuou neste período." />
        ) : (
          <ul className="fb-ui-dash-ranking__list" aria-label="Topo do ranking">
            {gamification.top.slice(0, RANKING_ROWS).map((entry) => (
              <li key={entry.clientId}>
                <span className="fb-ui-dash-ranking__pos">{entry.position}º</span>
                <span className="fb-ui-dash-ranking__name">{entry.fullName}</span>
                <span className="fb-ui-dash-ranking__count">
                  {plural(entry.attendances, "presença", "presenças")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * Dashboard administrativo (D-038, #156): quatro cartões de KPI (clientes ativos, ocupação média da semana, pontos
 * distribuídos e streaks ativos no mês), o painel "Ocupação por aula" com uma barra por modalidade na semana atual e o
 * painel "FitPoints" com o ranking do mês. Cada bloco só chega quando a pessoa enxerga o módulo que o alimenta, já
 * limitado ao escopo dela; a tela não mostra variação nem outro número que a API não devolva.
 */
export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", RankingPeriod.MONTH],
    queryFn: () => getDashboard(RankingPeriod.MONTH),
  });
  const dashboard = dashboardQuery.data;

  return (
    <div className="fb-ui-page">
      <PageHeader kicker="Visão geral" title="Dashboard" />

      <QueryBlockState
        query={dashboardQuery}
        hasData={dashboard !== undefined}
        loading="Carregando o dashboard…"
        error="Não foi possível carregar o dashboard."
      />

      {dashboard && (
        <>
          <dl className="fb-ui-kpis" aria-label="Indicadores">
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
          </dl>

          {(dashboard.occupancy || dashboard.gamification) && (
            <div className="fb-ui-dash-panels">
              {dashboard.occupancy && <OccupancyPanel week={dashboard.occupancy.week} />}
              {dashboard.gamification && (
                <GamificationPanel gamification={dashboard.gamification} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
