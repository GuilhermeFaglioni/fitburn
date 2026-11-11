import { describe, expect, it } from "vitest";
import { gymDateTimeToUtc, type ClientAgendaItem } from "@fitburn/contracts";
import {
  filterUpcoming,
  groupByHour,
  isUpcoming,
  occupancyRatio,
} from "../src/lib/agenda/group-by-hour";

let seq = 0;
function item(overrides: Partial<ClientAgendaItem> & { startsAt?: string } = {}): ClientAgendaItem {
  seq += 1;
  const startsAt = overrides.startsAt ?? gymDateTimeToUtc("2026-11-16", "07:00").toISOString();
  return {
    id: `aula-${seq}`,
    name: "Aula fictícia",
    description: null,
    modality: { id: "mod-spinning", name: "Spinning" },
    instructor: null,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
    durationMinutes: 60,
    capacity: 10,
    available: 5,
    myReservationId: null,
    ...overrides,
  };
}

function at(date: string, time: string): string {
  return gymDateTimeToUtc(date, time).toISOString();
}

describe("groupByHour", () => {
  it("usa o fuso da academia: 02:30 UTC cai no dia anterior", () => {
    const groups = groupByHour([item({ startsAt: "2026-11-17T02:30:00.000Z" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ date: "2026-11-16", time: "23:30", period: "noite" });
  });

  it("soma vagas e capacidade de aulas no mesmo horário", () => {
    const startsAt = at("2026-11-16", "07:00");
    const [group] = groupByHour([
      item({ startsAt, capacity: 12, available: 4 }),
      item({ startsAt, capacity: 8, available: 3 }),
    ]);
    expect(group).toMatchObject({ classCount: 2, available: 7, capacity: 20 });
  });

  it("separa horários e dias diferentes", () => {
    const groups = groupByHour([
      item({ startsAt: at("2026-11-17", "07:00") }),
      item({ startsAt: at("2026-11-16", "08:00") }),
      item({ startsAt: at("2026-11-16", "07:00") }),
    ]);
    expect(groups.map((g) => `${g.date} ${g.time}`)).toEqual([
      "2026-11-16 07:00",
      "2026-11-16 08:00",
      "2026-11-17 07:00",
    ]);
  });

  it("agrupa pelo início, ignorando os segundos", () => {
    const groups = groupByHour([
      item({ startsAt: "2026-11-16T10:00:00.000Z" }),
      item({ startsAt: "2026-11-16T10:00:30.000Z" }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("horário com uma aula só também vira grupo", () => {
    const [group] = groupByHour([item({ capacity: 6, available: 6 })]);
    expect(group).toMatchObject({ classCount: 1, available: 6, capacity: 6, mine: false });
    expect(group.items).toHaveLength(1);
  });

  it("status: 0 lotado, 3 poucas vagas, 4 aberto", () => {
    const status = (available: number) => groupByHour([item({ available })])[0].status;
    expect(status(0)).toBe("full");
    expect(status(1)).toBe("low");
    expect(status(3)).toBe("low");
    expect(status(4)).toBe("open");
  });

  it("status usa a soma das vagas do grupo", () => {
    const startsAt = at("2026-11-16", "07:00");
    const [group] = groupByHour([
      item({ startsAt, available: 0 }),
      item({ startsAt, available: 0 }),
    ]);
    expect(group.status).toBe("full");
    const [low] = groupByHour([item({ startsAt, available: 2 }), item({ startsAt, available: 2 })]);
    expect(low.status).toBe("open");
  });

  it("mine quando alguma aula tem myReservationId", () => {
    const startsAt = at("2026-11-16", "07:00");
    const [mine] = groupByHour([item({ startsAt }), item({ startsAt, myReservationId: "res-1" })]);
    const [other] = groupByHour([item({ startsAt }), item({ startsAt })]);
    expect(mine.mine).toBe(true);
    expect(other.mine).toBe(false);
  });

  it("ordena as aulas por início e depois pelo nome da modalidade", () => {
    const [group] = groupByHour([
      item({ id: "c", startsAt: "2026-11-16T10:00:30.000Z", modality: { id: "1", name: "Yoga" } }),
      item({ id: "b", startsAt: "2026-11-16T10:00:00.000Z", modality: { id: "2", name: "Pilates" } }),
      item({ id: "a", startsAt: "2026-11-16T10:00:00.000Z", modality: { id: "3", name: "Funcional" } }),
    ]);
    expect(group.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("modalidades únicas, na ordem de aparição", () => {
    const startsAt = at("2026-11-16", "07:00");
    const [group] = groupByHour([
      item({ startsAt, modality: { id: "1", name: "Yoga" } }),
      item({ startsAt, modality: { id: "2", name: "Spinning" } }),
      item({ startsAt, modality: { id: "1", name: "Yoga" } }),
    ]);
    expect(group.modalities).toEqual(["Spinning", "Yoga"]);
  });

  it("não muta a entrada e aceita lista vazia", () => {
    expect(groupByHour([])).toEqual([]);
  });

  it.each([
    ["00:00", "manhã"],
    ["11:59", "manhã"],
    ["12:00", "almoço"],
    ["13:59", "almoço"],
    ["14:00", "tarde"],
    ["17:59", "tarde"],
    ["18:00", "noite"],
    ["23:30", "noite"],
  ])("período às %s é %s", (time, period) => {
    const [group] = groupByHour([item({ startsAt: at("2026-11-16", time) })]);
    expect(group.period).toBe(period);
  });
});

describe("occupancyRatio", () => {
  const group = (capacity: number, available: number) =>
    groupByHour([item({ capacity, available })])[0];

  it("calcula (capacidade − vagas) / capacidade", () => {
    expect(occupancyRatio(group(20, 5))).toBe(0.75);
    expect(occupancyRatio(group(10, 0))).toBe(1);
    expect(occupancyRatio(group(10, 10))).toBe(0);
  });

  it("limita a [0, 1] e devolve 0 sem capacidade", () => {
    expect(occupancyRatio(group(10, -2))).toBe(1);
    expect(occupancyRatio(group(10, 15))).toBe(0);
    expect(occupancyRatio(group(0, 0))).toBe(0);
  });
});

describe("isUpcoming / filterUpcoming", () => {
  const now = new Date("2026-11-16T12:00:00.000Z");
  const started = item({ startsAt: "2026-11-16T11:00:00.000Z" });
  const exactlyNow = item({ startsAt: "2026-11-16T12:00:00.000Z" });
  const future = item({ startsAt: "2026-11-16T12:00:01.000Z" });

  it("descarta aula que já começou ou começa agora", () => {
    expect(isUpcoming(started, now)).toBe(false);
    expect(isUpcoming(exactlyNow, now)).toBe(false);
    expect(isUpcoming(future, now)).toBe(true);
  });

  it("filterUpcoming mantém só as futuras", () => {
    expect(filterUpcoming([started, exactlyNow, future], now)).toEqual([future]);
  });
});
