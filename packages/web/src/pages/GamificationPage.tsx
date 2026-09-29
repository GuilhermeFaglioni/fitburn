import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PointsEntryType, type PointsHistoryItem } from "@fitburn/contracts";
import { BackIcon } from "../components/icons/BackIcon";
import { getMyGamification } from "../lib/gamification/api";
import { formatHistoryWhen } from "../lib/gamification/format";

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
      return withSubject("Bônus de streak", item.subject);
    case PointsEntryType.REVERSAL:
      return withSubject("Correção de presença", item.subject);
  }
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

/**
 * Sua evolução (GamificacaoMobile.dc.html / GamificacaoDesktop.dc.html): o
 * total de pontos em laranja e o histórico dos ganhos. No mobile as seções
 * empilham na ordem do artboard; no desktop, coluna de 420px com o título e
 * os pontos, e o histórico ao lado (ver gamification.css). Streak, conquistas,
 * metas e ranking entram nas próximas issues, nos mesmos encaixes.
 */
export function GamificationPage() {
  const navigate = useNavigate();
  const summaryQuery = useQuery({
    queryKey: ["gamification", "me"],
    queryFn: getMyGamification,
  });
  const summary = summaryQuery.data;

  return (
    <div className="fb-gami">
      <div className="fb-gami__left">
        <div className="fb-gami__header">
          <button
            type="button"
            className="fb-back-btn fb-gami__back"
            aria-label="Voltar"
            onClick={() => navigate("/")}
          >
            <BackIcon />
          </button>
          <h1 className="fb-gami__title">Sua evolução</h1>
        </div>

        {summaryQuery.isError && (
          <p role="alert" className="fb-gami__alert">
            Não foi possível carregar sua evolução.
          </p>
        )}

        {summary && (
          <section className="fb-gami__points" aria-label="Pontos">
            <div className="fb-gami__points-row">
              <span className="fb-gami__points-total">
                {summary.totalPoints.toLocaleString("pt-BR")}
              </span>
              <span className="fb-gami__points-label">pontos totais</span>
            </div>
          </section>
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
                <div className="fb-client-empty">Nenhum ganho de pontos ainda.</div>
              ) : (
                <ul className="fb-gami__entries">
                  {summary.history.map((item) => (
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
        </div>
      </div>
    </div>
  );
}
