import { addDays, formatHour, gymToday, utcToGymDateTime, weekdayOf } from "@fitburn/contracts";

export { formatHour };

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

export const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function parts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** Horário local da academia de um instante ISO, no formato "07h00". */
export function formatInstantHour(iso: string): string {
  return formatHour(utcToGymDateTime(iso).time);
}

/** "15 – 21 de setembro" ou "29 de setembro – 5 de outubro". */
export function formatWeekRange(weekStart: string): string {
  const start = parts(weekStart);
  const end = parts(addDays(weekStart, 6));
  if (start.month === end.month) {
    return `${start.day} – ${end.day} de ${MONTHS[end.month - 1]}`;
  }
  return `${start.day} de ${MONTHS[start.month - 1]} – ${end.day} de ${MONTHS[end.month - 1]}`;
}

/** "SEG 15" (rótulo de coluna da agenda). */
export function formatDayLabel(date: string, weekday: number): string {
  return `${WEEKDAYS_SHORT[weekday]} ${parts(date).day}`;
}

/** "seg 05/10" — referência curta a um dia, usada em listas de conflito. */
export function formatShortDate(date: string, weekday: number): string {
  const { day, month } = parts(date);
  return `${WEEKDAYS_SHORT[weekday].toLowerCase()} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

const WEEKDAYS_FULL = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "Hoje, terça-feira 22" ou "Quarta-feira 23". */
export function formatDayHeading(date: string, weekday: number, today: string): string {
  const label = `${WEEKDAYS_FULL[weekday]} ${parts(date).day}`;
  return date === today ? `Hoje, ${label}` : label.charAt(0).toUpperCase() + label.slice(1);
}

/** "Hoje" ou "seg 05/10" — o dia de uma aula (instante ISO) no fuso da academia. */
export function formatClassDay(startsAt: string): string {
  const { date } = utcToGymDateTime(startsAt);
  return date === gymToday() ? "Hoje" : formatShortDate(date, weekdayOf(date));
}

/** "hoje às 07h00" ou "seg 05/10 às 07h00" — quando uma aula acontece, no meio de uma frase. */
export function formatClassMoment(startsAt: string): string {
  return `${formatClassDay(startsAt).toLowerCase()} às ${formatInstantHour(startsAt)}`;
}

/** "2026-09-20" → "20/09": o dia e o mês de uma data local. */
export function formatDayMonth(date: string): string {
  const { day, month } = parts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** "2026-09-20" → "20/09/2026": uma data local por extenso numérico, como nas tabelas administrativas. */
export function formatLocalDate(date: string): string {
  const { year, month, day } = parts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** A data local da academia de um instante ISO, como "20/09/2026". */
export function formatInstantDate(iso: string): string {
  return formatLocalDate(utcToGymDateTime(iso).date);
}
