import { utcToGymDateTime, type ClientAgendaItem } from "@fitburn/contracts";

export type HourGroupStatus = "open" | "low" | "full";
export type DayPeriod = "manhã" | "almoço" | "tarde" | "noite";

export interface HourGroup {
  /** Dia no fuso da academia ("YYYY-MM-DD"). */
  date: string;
  /** Hora de início no fuso da academia ("HH:mm"). */
  time: string;
  /** Aulas do horário, por início e depois pelo nome da modalidade. */
  items: ClientAgendaItem[];
  classCount: number;
  /** Nomes únicos, na ordem de aparição. */
  modalities: string[];
  /** Soma das vagas livres. */
  available: number;
  /** Soma das capacidades. */
  capacity: number;
  status: HourGroupStatus;
  /** Alguma aula do horário tem reserva do cliente. */
  mine: boolean;
  period: DayPeriod;
}

/** Até este total de vagas livres o horário é "Poucas vagas". */
const LOW_AVAILABILITY_LIMIT = 3;

function statusFor(available: number): HourGroupStatus {
  if (available <= 0) return "full";
  if (available <= LOW_AVAILABILITY_LIMIT) return "low";
  return "open";
}

function periodFor(time: string): DayPeriod {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "manhã";
  if (hour < 14) return "almoço";
  if (hour < 18) return "tarde";
  return "noite";
}

function compareItems(a: ClientAgendaItem, b: ClientAgendaItem): number {
  const byStart = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  if (byStart !== 0) return byStart;
  return a.modality.name.localeCompare(b.modality.name, "pt-BR");
}

/**
 * Agrupa as aulas por dia e hora de início (fuso da academia). Filtros (como
 * o de modalidade) devem ser aplicados antes.
 */
export function groupByHour(items: ClientAgendaItem[]): HourGroup[] {
  const buckets = new Map<string, { date: string; time: string; items: ClientAgendaItem[] }>();
  for (const item of items) {
    const { date, time } = utcToGymDateTime(item.startsAt);
    const key = `${date} ${time}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { date, time, items: [item] });
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, { date, time, items: bucketItems }]) => {
      const sorted = [...bucketItems].sort(compareItems);
      const available = sorted.reduce((sum, i) => sum + i.available, 0);
      return {
        date,
        time,
        items: sorted,
        classCount: sorted.length,
        modalities: [...new Set(sorted.map((i) => i.modality.name))],
        available,
        capacity: sorted.reduce((sum, i) => sum + i.capacity, 0),
        status: statusFor(available),
        mine: sorted.some((i) => i.myReservationId !== null),
        period: periodFor(time),
      };
    });
}

/** Ocupação do horário para a barrinha, de 0 a 1 (0 sem capacidade). */
export function occupancyRatio(group: Pick<HourGroup, "available" | "capacity">): number {
  if (group.capacity <= 0) return 0;
  const ratio = (group.capacity - group.available) / group.capacity;
  return Math.min(1, Math.max(0, ratio));
}

/** A aula ainda não começou (instante UTC de início depois de `now`). */
export function isUpcoming(item: ClientAgendaItem, now: Date): boolean {
  return new Date(item.startsAt).getTime() > now.getTime();
}

export function filterUpcoming(items: ClientAgendaItem[], now: Date): ClientAgendaItem[] {
  return items.filter((item) => isUpcoming(item, now));
}
