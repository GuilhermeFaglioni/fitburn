import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { gymToday, RankingPeriod, type GamificationSummary } from "@fitburn/contracts";
import { formatDayMonth, formatLocalDate } from "../lib/agenda/format";
import { useAuth } from "../lib/auth/AuthContext";
import { getMyGamification, getRanking } from "../lib/gamification/api";
import { getMyPlan } from "../lib/plans/api";
import { HomeReservations } from "./home/HomeReservations";

const SHORTCUTS = [
  { to: "/agenda", label: "Agenda" },
  { to: "/plano", label: "Plano" },
  { to: "/ficha-treino", label: "Ficha de treino" },
  { to: "/perfil", label: "Perfil" },
];

/** O badge conquistado mais recentemente, ou null se ainda não há nenhum. */
function latestBadge(badges: GamificationSummary["badges"]): number | null {
  const earned = badges
    .filter((badge) => badge.earned && badge.awardedAt)
    .sort((a, b) => b.awardedAt!.localeCompare(a.awardedAt!));
  return earned.length > 0 ? earned[0].milestone : null;
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
 * Home do cliente (HomeMobile.dc.html / HomeDesktop.dc.html): saudação, plano
 * ativo, próximas aulas, resumo da evolução e atalhos. Empilhada no mobile;
 * no desktop, coluna de 400px (saudação, plano, evolução) ao lado das aulas
 * (ver home.css). Cada bloco carrega e falha sozinho.
 */
export function ClientHomePage() {
  const { user } = useAuth();
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "";

  const planQuery = useQuery({ queryKey: ["plans", "mine"], queryFn: getMyPlan });
  const activePlan = planQuery.data?.active ?? null;
  const startsLater = activePlan !== null && activePlan.startDate > gymToday();

  return (
    <div className="fb-home">
      <div className="fb-home__main">
        <div className="fb-home__block">
          <h1 className="fb-home__greeting">{firstName ? `Olá, ${firstName}` : "Olá"}</h1>

          {planQuery.isError && (
            <p role="alert" className="fb-home__alert">
              Não foi possível carregar o seu plano.
            </p>
          )}
          {activePlan && (
            <section className="fb-home__plan" aria-label="Plano ativo">
              <div className="fb-home__plan-info">
                <span className="fb-home__plan-name">{activePlan.plan.name}</span>
                <span className="fb-home__plan-until">
                  {startsLater
                    ? `Começa em ${formatDayMonth(activePlan.startDate)}`
                    : `Ativo até ${formatLocalDate(activePlan.endDate)}`}
                </span>
                <span className="fb-home__plan-until">
                  {formatLocalDate(activePlan.startDate)} – {formatLocalDate(activePlan.endDate)}
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

        <Evolution />
      </div>

      <div className="fb-home__side">
        <HomeReservations />
        <nav className="fb-home__block" aria-label="Atalhos">
          <h2 className="fb-home__title">Atalhos</h2>
          <ul className="fb-home__shortcuts">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.to}>
                <Link to={shortcut.to} className="fb-home__shortcut">
                  {shortcut.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
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
  const badge = summary ? latestBadge(summary.badges) : null;

  return (
    <section className="fb-home__block" aria-label="Sua evolução">
      <div className="fb-home__row">
        <h2 className="fb-home__title">Sua evolução</h2>
        <Link to="/gamificacao" className="fb-home__link">
          Ver gamificação
        </Link>
      </div>

      {summaryQuery.isError && (
        <p role="alert" className="fb-home__alert">
          Não foi possível carregar sua evolução.
        </p>
      )}

      {summary && !hasPoints && (
        <div className="fb-client-empty">
          Você ainda não tem pontos. Reserve uma aula e confirme sua presença para começar a
          pontuar.
        </div>
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
            <span className="fb-home__points-label">Badge recente</span>
            {badge === null ? (
              <span className="fb-home__note">Nenhum badge conquistado ainda.</span>
            ) : (
              <span className="fb-home__badge-chip">
                <span className="fb-home__badge-disc">
                  <CheckIcon />
                </span>
                Streak de {badge} dias
              </span>
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
