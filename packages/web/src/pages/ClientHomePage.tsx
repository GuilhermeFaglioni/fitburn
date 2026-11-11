import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RankingPeriod, type GamificationSummary } from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import {
  getMyGamification,
  getRanking,
  getRankingConsent,
  rankingConsentQueryKey,
} from "../lib/gamification/api";
import { markTutorialSeen, shouldAutoOpenTutorial } from "../lib/pwa/install-tutorial";
import { HomeReservations } from "./home/HomeReservations";
import { formatGreetingDate } from "./home/format";
import { HomeEmpty } from "./home/HomeEmpty";
import { InstallTutorial } from "../components/InstallTutorial";
import { QueryBlockState } from "../components/QueryBlockState";
import { Card } from "../components/ui/Card";

/** Quantos badges recentes cabem na fileira da evolução. */
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
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

/**
 * Home do cliente (D-038, D-043): kicker da data e saudação, próximas aulas e o resumo de FitPoints, nessa ordem
 * no celular; no desktop, coluna de 400px (saudação, FitPoints) ao lado das aulas (grade em home.css). Sem o
 * cartão do plano: o plano e o histórico vivem no Perfil, e os atalhos entram em outra issue. Cada bloco carrega,
 * falha e fica sem conexão sozinho (QueryBlockState).
 * No primeiro acesso neste aparelho abre o tutorial de instalação do PWA; fechar de qualquer jeito marca como visto.
 */
export function ClientHomePage() {
  const { user } = useAuth();
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "";
  const [tutorialOpen, setTutorialOpen] = useState(shouldAutoOpenTutorial);

  return (
    <div className="fb-home">
      <div className="fb-home__intro">
        <div>
          <p className="fb-kicker fb-home__kicker">{formatGreetingDate()}</p>
          <h1 className="fb-home__greeting">{firstName ? `Olá, ${firstName}` : "Olá"}</h1>
        </div>
      </div>

      <HomeReservations />

      <Evolution />

      {tutorialOpen && (
        <InstallTutorial
          onClose={() => {
            markTutorialSeen();
            setTutorialOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Resumo da gamificação: pontos, streak, posição no ranking semanal e o badge recente. */
function Evolution() {
  const summaryQuery = useQuery({ queryKey: ["gamification", "me"], queryFn: getMyGamification });
  const summary = summaryQuery.data;
  const hasPoints = summary ? summary.totalPoints !== 0 || summary.history.length > 0 : false;
  const consentQuery = useQuery({
    queryKey: rankingConsentQueryKey,
    queryFn: getRankingConsent,
  });

  const rankingQuery = useQuery({
    queryKey: ["gamification", "ranking", RankingPeriod.WEEK],
    queryFn: () => getRanking(RankingPeriod.WEEK),
    enabled: hasPoints && consentQuery.data?.consented === true,
  });
  const myEntry = consentQuery.data?.consented
    ? rankingQuery.data?.entries.find((entry) => entry.isMe)
    : undefined;
  const badges = summary ? latestBadges(summary.badges) : [];

  return (
    <section className="fb-home__block" aria-label="FitPoints">
      <div className="fb-home__row">
        <h2 className="fb-home__title">FitPoints</h2>
        <Link to="/fitpoints" className="fb-home__link">
          Ver FitPoints<span aria-hidden="true"> →</span>
        </Link>
      </div>

      <QueryBlockState
        className="fb-home__state"
        query={summaryQuery}
        loading="Carregando seus FitPoints…"
        error="Não foi possível carregar seus FitPoints."
        hasData={summary !== undefined}
      />

      {summary && !hasPoints && (
        <HomeEmpty title="Você ainda não tem pontos. Reserve uma aula e confirme sua presença para começar a pontuar." />
      )}

      {summary && hasPoints && (
        <Card flat className="fb-home__evolution">
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
            <p className="fb-kicker fb-home__recent-label">Badges recentes</p>
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
          {consentQuery.data?.consented === false && hasPoints && (
            <span className="fb-home__note">
              Você não participa do ranking. Seus FitPoints continuam visíveis só para você.
            </span>
          )}
          {consentQuery.data?.consented && rankingQuery.isSuccess && !myEntry && (
            <span className="fb-home__note">Você ainda não pontuou no ranking desta semana.</span>
          )}
        </Card>
      )}
    </section>
  );
}
