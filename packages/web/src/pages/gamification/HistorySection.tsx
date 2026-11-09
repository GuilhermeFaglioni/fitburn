import { PointsEntryType, type PointsHistoryItem } from "@fitburn/contracts";
import { EmptyState } from "../../components/ui/States";
import { Card } from "../../components/ui/Card";
import { formatHistoryWhen } from "../../lib/gamification/format";

/** O histórico mostra os 3 ganhos mais recentes. */
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

/** Histórico recente dos ganhos de pontos: texto, quando aconteceu e os pontos (o sinal vai no texto, não só na cor). */
export function HistorySection({ history }: { history: PointsHistoryItem[] }) {
  return (
    <section className="fb-gami__section" aria-labelledby="fb-gami-history">
      <h2 id="fb-gami-history" className="fb-gami__section-title">
        Histórico recente
      </h2>
      {history.length === 0 ? (
        <EmptyState
          title="Nenhum ganho de pontos ainda."
          description="Reserve uma aula e confirme sua presença para começar a pontuar."
        />
      ) : (
        <Card flat className="fb-gami__history">
          <ul className="fb-gami__entries">
            {history.slice(0, HISTORY_LIMIT).map((item) => (
              <li key={item.id} className="fb-gami__entry">
                <div className="fb-gami__entry-info">
                  <span className="fb-gami__entry-title">{describeEntry(item)}</span>
                  <span className="fb-gami__entry-when">{formatHistoryWhen(item.occurredAt)}</span>
                </div>
                <span
                  className={`fb-gami__entry-points${item.points < 0 ? " fb-gami__entry-points--negative" : ""}`}
                >
                  {formatPoints(item.points)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
