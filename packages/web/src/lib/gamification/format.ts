import { daysBetween, formatHour, gymToday, utcToGymDateTime } from "@fitburn/contracts";

/** Quando um ganho aconteceu, como no histórico do canvas: "Hoje, 18h32", "Ontem", "Há 3 dias". */
export function formatHistoryWhen(occurredAt: string): string {
  const { date, time } = utcToGymDateTime(occurredAt);
  const days = daysBetween(date, gymToday());
  if (days <= 0) return `Hoje, ${formatHour(time)}`;
  if (days === 1) return "Ontem";
  return `Há ${days} dias`;
}
