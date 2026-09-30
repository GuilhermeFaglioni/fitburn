import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { gymToday, RankingPeriod, type GamificationSummary } from "@fitburn/contracts";
import { formatDayMonth } from "../lib/agenda/format";
import { useAuth } from "../lib/auth/AuthContext";
import { getMyGamification, getRanking } from "../lib/gamification/api";
import { getMyPlan } from "../lib/plans/api";
import { HomeReservations } from "./home/HomeReservations";
import { formatPlanEnd } from "./home/format";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

/** Quantos badges recentes cabem na fileira da evolução (HomeDesktop.dc.html mostra três). */
const MAX_BADGES = 3;

/** Os badges conquistados mais recentemente (marcos de streak), do mais novo para o mais antigo. */
function latestBadges(badges: GamificationSummary["badges"]): number[] {
  return badges
    .filter((badge) => badge.earned && badge.awardedAt)
    .sort((a, b) => b.awardedAt!.localeCompare(a.awardedAt!))
    .slice(0, MAX_BADGES)
    .map((badge) => badge.milestone);
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5L6.2 11.5L13 4"
        stroke="#ed6e34"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Home do cliente (HomeMobile.dc.html / HomeDesktop.dc.html): saudação e plano
 * ativo, próximas aulas e resumo da evolução, nessa ordem no mobile; no desktop,
 * coluna de 400px (saudação, plano, evolução) ao lado das aulas (grade em
 * home.css). Cada bloco carrega e falha sozinho.
 */
export function ClientHomePage() {
  const { user } = useAuth();
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "";

  const planQuery = useQuery({ queryKey: ["plans", "mine"], queryFn: getMyPlan });
  const activePlan = planQuery.data?.active ?? null;
  const startsLater = activePlan !== null && activePlan.startDate > gymToday();

  return (
    <div className="fb-home">
      <div className="fb-home__intro">
        <h1 className="fb-home__greeting">{firstName ? `Olá, ${firstName}` : "Olá"}</h1>

        {planQuery.isLoading && <LoadingState surface="dark" />}
        {planQuery.isError && (
          <ErrorState
            surface="dark"
            message="Não foi possível carregar o seu plano."
            onRetry={() => void planQuery.refetch()}
          />
        )}
        {activePlan && (
          <section className="fb-home__plan" aria-label="Plano ativo">
            <div className="fb-home__plan-info">
              <span className="fb-home__plan-name">{activePlan.plan.name}</span>
              <span className="fb-home__plan-until">
                {startsLater
                  ? `Começa em ${formatDayMonth(activePlan.startDate)}`
                  : `Ativo até ${formatPlanEnd(activePlan.endDate)}`}
              </span>
            </div>
            {!startsLater && <span className="fb-home__badge">ATIVO</span>}
          </section>
        )}
        {planQuery.data && !activePlan && (
          <div className="fb-home__plan fb-home__plan--empty">
            Você ainda não tem um plano ativo. Fale com a recepção para começar.
          </div>
        )}
      </div>

      <HomeReservations />

      <Evolution />
    </div>
  );
}

/** Resumo da gamificação: pontos, streak, posição no ranking semanal e o badge recente. */
function Evolution() {
  const summaryQuery = useQuery({ queryKey: ["gamification", "me"], queryFn: getMyGamification });
  const summary = summaryQuery.data;
  const hasPoints = summary ? summary.totalPoints !== 0 || summary.history.length > 0 : false;

  const rankingQuery = useQuery({
    queryKey: ["gamification", "ranking", RankingPeriod.WEEK],
    queryFn: () => getRanking(RankingPeriod.WEEK),
    enabled: hasPoints,
  });
  const myEntry = rankingQuery.data?.entries.find((entry) => entry.isMe);
  const badges = summary ? latestBadges(summary.badges) : [];

  return (
    <section className="fb-home__block" aria-label="Sua evolução">
      <div className="fb-home__row">
        <h2 className="fb-home__title">Sua evolução</h2>
        <Link to="/gamificacao" className="fb-home__link">
          Ver gamificação
        </Link>
      </div>

      {summaryQuery.isLoading && <LoadingState surface="dark" />}
      {summaryQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar sua evolução."
          onRetry={() => void summaryQuery.refetch()}
        />
      )}

      {summary && !hasPoints && (
        <EmptyState
          surface="dark"
          message="Você ainda não tem pontos. Reserve uma aula e confirme sua presença para começar a pontuar."
        />
      )}

      {summary && hasPoints && (
        <div className="fb-home__evolution">
          <div className="fb-home__points-row">
            <div className="fb-home__points">
              <span className="fb-home__points-total">
                {summary.totalPoints.toLocaleString("pt-BR")}
              </span>
              <span className="fb-home__points-label">pontos</span>
            </div>
            <div className="fb-home__streak">
              <span className="fb-home__streak-count">{summary.streak.current}</span>
              <span className="fb-home__streak-label">dias seguidos de treino</span>
            </div>
          </div>

          <div className="fb-home__recent-badge">
            <span className="fb-home__points-label">Badges recentes</span>
            {badges.length === 0 ? (
              <span className="fb-home__note">Nenhum badge conquistado ainda.</span>
            ) : (
              <ul className="fb-home__badges">
                {badges.map((milestone) => (
                  <li key={milestone}>
                    <span
                      className="fb-home__badge-disc"
                      role="img"
                      aria-label={`Streak de ${milestone} dias`}
                    >
                      <CheckIcon />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {myEntry && (
            <span className="fb-home__note">{myEntry.position}º lugar no ranking semanal</span>
          )}
          {rankingQuery.isSuccess && !myEntry && (
            <span className="fb-home__note">Você ainda não pontuou no ranking desta semana.</span>
          )}
        </div>
      )}
    </section>
  );
}
