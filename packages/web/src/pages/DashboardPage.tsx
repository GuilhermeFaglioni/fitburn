import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  RankingPeriod,
  utcToGymDateTime,
  weekdayOf,
  type Dashboard,
  type DashboardOccupancyItem,
  type RankingPeriodName,
} from "@fitburn/contracts";
import { formatDayHeading, formatInstantHour } from "../lib/agenda/format";
import { getDashboard } from "../lib/dashboard/api";

const PERIODS: Array<{ period: RankingPeriodName; label: string }> = [
  { period: RankingPeriod.WEEK, label: "Semana" },
  { period: RankingPeriod.MONTH, label: "Mês" },
];

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function OccupancyRow({ item }: { item: DashboardOccupancyItem }) {
  const full = item.availableSpots === 0;
  return (
    <li className="fb-dash__class">
      <span className="fb-dash__class-hour">{formatInstantHour(item.startsAt)}</span>
      <span className="fb-dash__class-name">{item.name}</span>
      <span className="fb-dash__class-count">
        {item.booked}/{item.capacity}
      </span>
      <span className={`fb-badge fb-badge--${full ? "accent" : "neutral"}`}>
        {full ? "Lotada" : plural(item.availableSpots, "vaga", "vagas")}
      </span>
    </li>
  );
}

function OccupancyBlock({
  occupancy,
  today,
}: {
  occupancy: NonNullable<Dashboard["occupancy"]>;
  today: string;
}) {
  const byDay = new Map<string, DashboardOccupancyItem[]>();
  for (const item of occupancy.week) {
    const { date } = utcToGymDateTime(item.startsAt);
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
  }

  return (
    <section className="fb-dash__block" aria-labelledby="fb-dash-occupancy">
      <h2 id="fb-dash-occupancy" className="fb-dash__block-title">
        Ocupação das aulas
      </h2>
      <div className="fb-dash__columns">
        <div>
          <h3 className="fb-dash__sub-title">Hoje</h3>
          {occupancy.today.length === 0 ? (
            <p className="fb-note">Nenhuma aula hoje.</p>
          ) : (
            <ul className="fb-dash__list" aria-label="Aulas de hoje">
              {occupancy.today.map((item) => (
                <OccupancyRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="fb-dash__sub-title">Semana</h3>
          {byDay.size === 0 ? (
            <p className="fb-note">Nenhuma aula nesta semana.</p>
          ) : (
            [...byDay.entries()].map(([date, items]) => (
              <div key={date} className="fb-dash__day">
                <h4 className="fb-dash__day-title">
                  {formatDayHeading(date, weekdayOf(date), today)}
                </h4>
                <ul className="fb-dash__list" aria-label={`Aulas de ${date}`}>
                  {items.map((item) => (
                    <OccupancyRow key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="fb-dash__metric">
      <span className="fb-dash__metric-value">{value}</span>
      <span className="fb-dash__metric-label">{label}</span>
    </div>
  );
}

/**
 * Dashboard administrativo: ocupação e vagas das aulas de hoje e da semana,
 * clientes ativos e os indicadores de gamificação do período (semana ou mês
 * atuais). Cada bloco só chega quando a pessoa enxerga o módulo que o
 * alimenta, já limitado ao escopo dela.
 */
export function DashboardPage() {
  const [period, setPeriod] = useState<RankingPeriodName>(RankingPeriod.WEEK);
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => getDashboard(period),
    placeholderData: keepPreviousData,
  });
  const dashboard = dashboardQuery.data;

  return (
    <div className="fb-dash">
      <h1 className="fb-page-title">Dashboard</h1>

      {dashboardQuery.isError && <p role="alert">Não foi possível carregar o dashboard.</p>}

      {dashboard && (
        <>
          {dashboard.occupancy && (
            <OccupancyBlock occupancy={dashboard.occupancy} today={dashboard.today} />
          )}

          {dashboard.activeClients && (
            <section className="fb-dash__block" aria-labelledby="fb-dash-clients">
              <h2 id="fb-dash-clients" className="fb-dash__block-title">
                Clientes ativos
              </h2>
              <Metric label="clientes ativos" value={dashboard.activeClients.total} />
            </section>
          )}

          {dashboard.gamification && (
            <section className="fb-dash__block" aria-labelledby="fb-dash-gamification">
              <div className="fb-dash__block-head">
                <h2 id="fb-dash-gamification" className="fb-dash__block-title">
                  Gamificação
                </h2>
                <div className="fb-tabs" role="group" aria-label="Período dos indicadores">
                  {PERIODS.map((option) => (
                    <button
                      key={option.period}
                      type="button"
                      className={`fb-tab-btn${period === option.period ? " active" : ""}`}
                      aria-pressed={period === option.period}
                      onClick={() => setPeriod(option.period)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fb-dash__metrics">
                <Metric
                  label="pontos distribuídos"
                  value={dashboard.gamification.pointsDistributed}
                />
                <Metric label="presenças" value={dashboard.gamification.attendances} />
                <Metric
                  label="clientes com streak ativo"
                  value={dashboard.gamification.clientsWithActiveStreak}
                />
              </div>
              <h3 className="fb-dash__sub-title">Topo do ranking</h3>
              {dashboard.gamification.top.length === 0 ? (
                <p className="fb-note">Ninguém pontuou neste período.</p>
              ) : (
                <ol className="fb-dash__list" aria-label="Topo do ranking">
                  {dashboard.gamification.top.map((entry) => (
                    <li key={entry.clientId} className="fb-dash__class">
                      <span className="fb-dash__class-hour">{entry.position}º</span>
                      <span className="fb-dash__class-name">{entry.fullName}</span>
                      <span className="fb-dash__class-count">
                        {plural(entry.attendances, "presença", "presenças")}
                        {entry.tied ? " · empate" : ""}
                      </span>
                      <span className="fb-badge fb-badge--accent">{entry.points} pts</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
