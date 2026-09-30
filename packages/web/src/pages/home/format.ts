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

/** "2026-11-15" → "15 de novembro" (com o ano só quando não é o ano corrente): o "Ativo até ..." da Home. */
export function formatPlanEnd(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const currentYear = Number(gymToday().slice(0, 4));
  return `${day} de ${MONTHS[month - 1]}${year === currentYear ? "" : ` de ${year}`}`;
}

/**
 * Quando uma aula acontece, como nas "Próximas aulas" da Home (HomeDesktop.dc.html):
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

/** "Rafael Andrade" → "Rafael" (o design mostra o professor só pelo primeiro nome). */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
