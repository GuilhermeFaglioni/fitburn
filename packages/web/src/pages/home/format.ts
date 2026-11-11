import { addDays, gymToday, utcToGymDateTime, weekdayOf } from "@fitburn/contracts";
import { formatInstantHour } from "../../lib/agenda/format";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Quando uma aula acontece, como nas "Próximas aulas" da Home:
 * "Hoje, 18h00", "Quinta, 07h00". Depois de uma semana o dia entra junto ("Quinta 08/10, 07h00"),
 * para não confundir com a quinta desta semana.
 */
export function formatUpcomingMoment(startsAt: string): string {
  const { date } = utcToGymDateTime(startsAt);
  const time = formatInstantHour(startsAt);
  const today = gymToday();
  if (date === today) return `Hoje, ${time}`;
  const weekday = WEEKDAYS[weekdayOf(date)];
  if (date < addDays(today, 7)) return `${weekday}, ${time}`;
  const [, month, day] = date.split("-");
  return `${weekday} ${day}/${month}, ${time}`;
}

/** "2026-11-10" → "Terça, 10 de novembro": o kicker acima da saudação da Home. */
export function formatGreetingDate(date: string = gymToday()): string {
  const [, month, day] = date.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(date)]}, ${day} de ${MONTHS[month - 1]}`;
}
