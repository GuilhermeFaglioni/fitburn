/**
 * Datas e horários no fuso da academia (America/Sao_Paulo), sem dependências.
 *
 * Todo o seed trabalha com "dia local" (YYYY-MM-DD) e "hora local" (HH:mm), como
 * a API: o instante UTC só aparece na hora de gravar no banco.
 */
import { addDays, gymToday, weekdayOf } from "../../design-compare/lib/env.mjs";

export { addDays, gymToday, weekdayOf };

const GYM_TIME_ZONE = "America/Sao_Paulo";

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

function zonedParts(instant) {
  const parts = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Diferença (ms) entre o relógio da academia e UTC naquele instante. */
function offsetMs(instant) {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante UTC (Date) de uma data e hora locais da academia. */
export function gymDateTimeToUtc(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naiveUtc - offsetMs(new Date(naiveUtc));
  return new Date(naiveUtc - offsetMs(new Date(firstGuess)));
}

/** Data ("YYYY-MM-DD") e hora ("HH:mm") locais de um instante. */
export function utcToGym(instant) {
  const p = zonedParts(typeof instant === "string" ? new Date(instant) : instant);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** "Agora" no relógio da academia: dia, hora e minutos desde a meia-noite. */
export function gymNow() {
  const { date, time } = utcToGym(new Date());
  return { date, time, minutes: toMinutes(time) };
}

/** "HH:mm" para minutos desde a meia-noite. */
export function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Minutos desde a meia-noite para "HH:mm". */
export function toTime(minutes) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "qua 01/10" — como as telas mostram. */
export function shortDay(date) {
  const [, month, day] = date.split("-");
  return `${WEEKDAYS[weekdayOf(date)]} ${day}/${month}`;
}

/** "YYYY-MM-DD" no formato brasileiro, dd/mm/aaaa. */
export function brDate(date) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
