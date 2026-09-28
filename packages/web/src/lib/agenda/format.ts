import { addDays, utcToGymDateTime } from "@fitburn/contracts";

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

const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function parts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** "07h00" — convenção de horário do canvas de design. */
export function formatHour(time: string): string {
  return time.replace(":", "h");
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
