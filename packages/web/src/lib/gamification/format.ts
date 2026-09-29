import {
  daysBetween,
  formatHour,
  gymToday,
  PointsEntryType,
  utcToGymDateTime,
  type PointsHistoryItem,
} from "@fitburn/contracts";

/** Quando um ganho aconteceu, como no histórico do canvas: "Hoje, 18h32", "Ontem", "Há 3 dias". */
export function formatHistoryWhen(occurredAt: string): string {
  const { date, time } = utcToGymDateTime(occurredAt);
  const days = daysBetween(date, gymToday());
  if (days <= 0) return `Hoje, ${formatHour(time)}`;
  if (days === 1) return "Ontem";
  return `Há ${days} dias`;
}

function withSubject(label: string, subject: string | null): string {
  return subject ? `${label} · ${subject}` : label;
}

/** O texto de um ganho no histórico ("Presença confirmada · Treino Funcional"). */
export function describeEntry(item: PointsHistoryItem): string {
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

export function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}
