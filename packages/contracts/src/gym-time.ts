/**
 * Datas e horários da agenda são sempre os da academia (America/Sao_Paulo),
 * independente do fuso de quem usa o sistema. O banco guarda instantes UTC;
 * a conversão local ⇄ UTC acontece só aqui, com Intl (sem dependência de
 * biblioteca de fuso).
 *
 * "LocalDate" = "YYYY-MM-DD" e "LocalTime" = "HH:mm", ambos no fuso da academia.
 */
export const GYM_TIME_ZONE = "America/Sao_Paulo";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: GYM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Diferença (ms) entre o relógio da academia e UTC naquele instante. */
function offsetMs(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function parseLocalDate(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Instante UTC correspondente a uma data e hora locais da academia. */
export function gymDateTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = parseLocalDate(date);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naiveUtc - offsetMs(new Date(naiveUtc));
  // Recalcula com o offset do instante já corrigido (relevante só perto de
  // uma troca de horário de verão).
  return new Date(naiveUtc - offsetMs(new Date(firstGuess)));
}

/** Data ("YYYY-MM-DD") e hora ("HH:mm") locais da academia para um instante. */
export function utcToGymDateTime(instant: Date | string): { date: string; time: string } {
  const p = zonedParts(typeof instant === "string" ? new Date(instant) : instant);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** "07h00" — convenção de horário do canvas de design, a partir de "07:00". */
export function formatHour(time: string): string {
  return time.replace(":", "h");
}

/** Soma dias a uma data local (aritmética de calendário, sem fuso). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parseLocalDate(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

/** Dias de calendário de `from` até `to` (negativo se `to` for anterior). */
export function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = parseLocalDate(from);
  const [toYear, toMonth, toDay] = parseLocalDate(to);
  const DAY_MS = 24 * 60 * 60_000;
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS,
  );
}

/** O dia ("YYYY-MM-DD") de uma data guardada como DATE no banco (UTC 00h00). */
export function dateOnlyToLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Primeiro dia do mês da data local. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

/** Dia da semana de uma data local: 0 = domingo … 6 = sábado. */
export function weekdayOf(date: string): number {
  const [year, month, day] = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Segunda-feira da semana que contém a data local. */
export function startOfWeek(date: string): string {
  const weekday = weekdayOf(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** Hoje, no calendário da academia. */
export function gymToday(now: Date = new Date()): string {
  return utcToGymDateTime(now).date;
}

/** Soma meses a uma data local; o dia é limitado ao último dia do mês de destino. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = parseLocalDate(date);
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDayOfTarget)));
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}

/** Datas locais entre início e fim (inclusive) que caem nos dias da semana pedidos. */
export function expandRecurrenceDates(
  startDate: string,
  endDate: string,
  weekdays: number[],
): string[] {
  const wanted = new Set(weekdays);
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if (wanted.has(weekdayOf(date))) dates.push(date);
  }
  return dates;
}
