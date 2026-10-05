import { useQuery } from "@tanstack/react-query";
import {
  PointsEntryType,
  type GamificationSummary,
  type PointsHistoryItem,
} from "@fitburn/contracts";
import { getMyGamification } from "../lib/gamification/api";
import { formatHistoryWhen } from "../lib/gamification/format";
import { GoalsSection } from "./gamification/GoalsSection";
import { RankingSection } from "./gamification/RankingSection";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

/** Traço na cor do texto do pai (laranja no marco alcançado, esmaecido no pendente). */
function MarkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5L6.2 11.5L13 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M5 11L9 15L17 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="9"
        width="11"
        height="8"
        rx="1.5"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.4"
      />
      <path
        d="M6.5 9V6.5C6.5 4.6 8 3 10 3C12 3 13.5 4.6 13.5 6.5V9"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** O artboard mostra os 3 ganhos mais recentes. */
const HISTORY_LIMIT = 3;

function withSubject(label: string, subject: string | null): string {
  return subject ? `${label} · ${subject}` : label;
}

/** O texto de um ganho no histórico ("Presença confirmada · Treino Funcional"). */
function describeEntry(item: PointsHistoryItem): string {
  switch (item.type) {
    case PointsEntryType.ATTENDANCE:
      return withSubject("Presença confirmada", item.subject);
    case PointsEntryType.GOAL:
      return withSubject("Meta concluída", item.subject);
    case PointsEntryType.STREAK_BONUS:
      return item.milestone ? `Streak de ${item.milestone} dias consecutivos` : "Bônus de streak";
    case PointsEntryType.REVERSAL:
      // O estorno de um bônus de streak herda o marco; o de uma presença, a aula.
      return item.milestone
        ? `Bônus de streak estornado · ${item.milestone} dias`
        : withSubject("Correção de presença", item.subject);
  }
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

/**
 * Streak atual, a linha de marcos alcançados na sequência de agora e, quando ainda há um marco pela
 * frente, o próximo (o artboard só mostra o estado com todos os marcos alcançados: sem frase de fechamento).
 */
function StreakProgress({ streak, badges }: Pick<GamificationSummary, "streak" | "badges">) {
  return (
    <>
      <div className="fb-gami__streak">
        <span className="fb-gami__streak-count">{streak.current}</span>
        <span className="fb-gami__streak-label">dias seguidos de treino</span>
      </div>
      <ul className="fb-gami__marks">
        {badges.map(({ milestone }) => {
          const reached = streak.current >= milestone;
          return (
            <li
              key={milestone}
              className={`fb-gami__mark${reached ? "" : " fb-gami__mark--pending"}`}
              aria-label={`${milestone} dias, ${reached ? "alcançado" : "ainda não alcançado"}`}
            >
              <MarkIcon />
              <span className="fb-gami__mark-label">{milestone} dias</span>
            </li>
          );
        })}
      </ul>
      {streak.next && (
        <span className="fb-gami__streak-next">
          {`Próximo marco: ${streak.next.threshold} dias (+${streak.next.bonusPoints} pontos)`}
        </span>
      )}
    </>
  );
}

/** Conquistas: um badge por marco de streak; os bloqueados esmaecem e mostram o progresso. */
function Achievements({ streak, badges }: Pick<GamificationSummary, "streak" | "badges">) {
  return (
    <section className="fb-gami__section fb-gami__achievements" aria-labelledby="fb-gami-badges">
      <h2 id="fb-gami-badges" className="fb-gami__section-title">
        Conquistas
      </h2>
      <ul className="fb-gami__badges">
        {badges.map(({ milestone, earned }) => {
          const label = earned
            ? `Streak de ${milestone}`
            : `Streak de ${milestone} (${Math.min(streak.current, milestone)}/${milestone})`;
          return (
            <li
              key={milestone}
              className={`fb-gami__badge${earned ? "" : " fb-gami__badge--locked"}`}
              aria-label={`${label}, ${earned ? "conquistado" : "bloqueado"}`}
            >
              <span className="fb-gami__badge-disc">{earned ? <CheckIcon /> : <LockIcon />}</span>
              <span className="fb-gami__badge-label">{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * FitPoints (GamificacaoMobile.dc.html / GamificacaoDesktop.dc.html): o
 * total de pontos em laranja com o streak e os marcos, o histórico dos ganhos
 * e as conquistas. No mobile as seções empilham na ordem do artboard; no
 * desktop, coluna de 420px com título, pontos e conquistas, e o histórico ao
 * lado (com as metas do professor), e o ranking embaixo (ver gamification.css).
 */
export function GamificationPage() {
  const summaryQuery = useQuery({
    queryKey: ["gamification", "me"],
    queryFn: getMyGamification,
  });
  const summary = summaryQuery.data;
  const hasMilestones = (summary?.badges.length ?? 0) > 0;

  return (
    <div className="fb-gami">
      <div className="fb-gami__left">
        <div className="fb-gami__header">
          <h1 className="fb-gami__title">FitPoints</h1>
        </div>

        {summaryQuery.isLoading && <LoadingState surface="dark" />}
        {summaryQuery.isError && (
          <ErrorState
            surface="dark"
            message="Não foi possível carregar seus FitPoints."
            onRetry={() => void summaryQuery.refetch()}
          />
        )}

        {summary && (
          <section className="fb-gami__points" aria-label="Pontos">
            <div className="fb-gami__points-row">
              <span className="fb-gami__points-total">
                {summary.totalPoints.toLocaleString("pt-BR")}
              </span>
              <span className="fb-gami__points-label">pontos totais</span>
            </div>
            {hasMilestones && <StreakProgress streak={summary.streak} badges={summary.badges} />}
          </section>
        )}

        {summary && hasMilestones && (
          <Achievements streak={summary.streak} badges={summary.badges} />
        )}
      </div>

      <div className="fb-gami__right">
        <div className="fb-gami__row">
          {summary && (
            <section
              className="fb-gami__section fb-gami__history"
              aria-labelledby="fb-gami-history"
            >
              <h2 id="fb-gami-history" className="fb-gami__section-title">
                Histórico recente
              </h2>
              {summary.history.length === 0 ? (
                <EmptyState surface="dark" message="Nenhum ganho de pontos ainda." />
              ) : (
                <ul className="fb-gami__entries">
                  {summary.history.slice(0, HISTORY_LIMIT).map((item) => (
                    <li key={item.id} className="fb-gami__entry">
                      <div className="fb-gami__entry-info">
                        <span className="fb-gami__entry-title">{describeEntry(item)}</span>
                        <span className="fb-gami__entry-when">
                          {formatHistoryWhen(item.occurredAt)}
                        </span>
                      </div>
                      <span
                        className={`fb-gami__entry-points${item.points < 0 ? " fb-gami__entry-points--negative" : ""}`}
                      >
                        {formatPoints(item.points)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <GoalsSection />
        </div>
        <RankingSection />
      </div>
    </div>
  );
}
