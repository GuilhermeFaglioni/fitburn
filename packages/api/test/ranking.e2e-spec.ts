import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  addDays,
  addMonths,
  gymDateTimeToUtc,
  gymToday,
  startOfMonth,
  startOfWeek,
} from "@fitburn/contracts";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Ranking semanal e mensal (HTTP)", () => {
  let app: INestApplication;
  let clientProfileId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
  });

  async function createClient(name: string) {
    const user = await createUser({
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@fitburn.local`,
      password: PASSWORD,
      profileId: clientProfileId,
      fullName: name,
    });
    return { user, token: await loginAndGetAccessToken(app, user.email, PASSWORD) };
  }

  const today = gymToday();
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);

  /** Início do dia local da academia como instante. */
  const dayStart = (date: string) => gymDateTimeToUtc(date, "00:00");
  /** Um minuto antes do início do dia: ainda é o dia anterior. */
  const justBefore = (date: string) => new Date(dayStart(date).getTime() - 60_000);

  const nextMonthStart = addMonths(monthStart, 1);

  async function attendance(clientId: string, occurredAt: Date, points = 10) {
    return testPrisma.pointsEntry.create({
      data: { clientId, type: "ATTENDANCE", points, occurredAt },
    });
  }

  async function goal(clientId: string, occurredAt: Date, points = 25) {
    return testPrisma.pointsEntry.create({ data: { clientId, type: "GOAL", points, occurredAt } });
  }

  function ranking(token: string, period?: string) {
    const query = period === undefined ? "" : `?period=${period}`;
    return request(app.getHttpServer())
      .get(`/api/gamification/ranking${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  const summary = (body: { entries: Array<{ position: number; name: string }> }) =>
    body.entries.map((entry) => [entry.position, entry.name]);

  it("ordena pela soma do ledger no período e mostra só o primeiro nome e a inicial do sobrenome", async () => {
    const ana = await createClient("Ana Paula Souza");
    const bruno = await createClient("Bruno Alves");
    const camila = await createClient("Camila");
    const now = new Date();
    await attendance(ana.user.id, now, 10);
    await attendance(ana.user.id, now, 10);
    await attendance(ana.user.id, now, 10);
    await attendance(bruno.user.id, now, 10);
    await attendance(bruno.user.id, now, 10);
    await attendance(camila.user.id, now, 10);

    const response = await ranking(ana.token, "week");

    expect(response.status).toBe(200);
    expect(response.body.period).toBe("week");
    expect(response.body.from).toBe(weekStart);
    expect(response.body.to).toBe(addDays(weekStart, 6));
    expect(response.body.entries).toEqual([
      {
        position: 1,
        name: "Ana S.",
        firstName: "Ana",
        points: 30,
        attendances: 3,
        tied: false,
        isMe: true,
      },
      {
        position: 2,
        name: "Bruno A.",
        firstName: "Bruno",
        points: 20,
        attendances: 2,
        tied: false,
        isMe: false,
      },
      {
        position: 3,
        name: "Camila",
        firstName: "Camila",
        points: 10,
        attendances: 1,
        tied: false,
        isMe: false,
      },
    ]);
  });

  it("a semana vai de segunda 00h00 a domingo 23h59 no horário da academia", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    const camila = await createClient("Camila Duarte");
    await attendance(ana.user.id, dayStart(weekStart));
    await attendance(bruno.user.id, justBefore(weekStart));
    await attendance(camila.user.id, justBefore(addDays(weekStart, 7)));
    await attendance(camila.user.id, dayStart(addDays(weekStart, 7)));

    const response = await ranking(ana.token, "week");

    // Ana (segunda 00h00) e Camila (domingo 23h59) entram; Bruno (domingo anterior) e a segunda seguinte não.
    expect(summary(response.body)).toEqual([
      [1, "Ana P."],
      [1, "Camila D."],
    ]);
    expect(response.body.entries.map((entry: { points: number }) => entry.points)).toEqual([
      10, 10,
    ]);
  });

  it("o mês é o calendário: do dia 1 às 00h00 até o último dia", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    const camila = await createClient("Camila Duarte");
    await attendance(ana.user.id, dayStart(monthStart));
    await attendance(bruno.user.id, justBefore(monthStart));
    await attendance(camila.user.id, justBefore(nextMonthStart));
    await attendance(bruno.user.id, dayStart(nextMonthStart));

    const response = await ranking(ana.token, "month");

    expect(response.body.period).toBe("month");
    expect(response.body.from).toBe(monthStart);
    expect(response.body.to).toBe(addDays(nextMonthStart, -1));
    expect(summary(response.body)).toEqual([
      [1, "Ana P."],
      [1, "Camila D."],
    ]);
  });

  it("empate em pontos é decidido por quem tem mais presenças no período", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    const now = new Date();
    // Os dois somam 20 pontos: Ana com 2 presenças, Bruno com 1 presença e uma meta.
    await attendance(ana.user.id, now);
    await attendance(ana.user.id, now);
    await attendance(bruno.user.id, now);
    await goal(bruno.user.id, now, 10);

    const response = await ranking(ana.token, "week");

    expect(response.body.entries.map((entry: { points: number }) => entry.points)).toEqual([
      20, 20,
    ]);
    expect(summary(response.body)).toEqual([
      [1, "Ana P."],
      [2, "Bruno A."],
    ]);
    expect(response.body.entries.map((entry: { tied: boolean }) => entry.tied)).toEqual([
      false,
      false,
    ]);
  });

  it("empate que persiste divide a posição e a seguinte é pulada (1, 1, 3)", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    const camila = await createClient("Camila Duarte");
    const now = new Date();
    await attendance(ana.user.id, now);
    await attendance(ana.user.id, now);
    await attendance(bruno.user.id, now);
    await attendance(bruno.user.id, now);
    await attendance(camila.user.id, now);

    const response = await ranking(camila.token, "week");

    expect(
      response.body.entries.map((e: { position: number; tied: boolean; isMe: boolean }) => [
        e.position,
        e.tied,
        e.isMe,
      ]),
    ).toEqual([
      [1, true, false],
      [1, true, false],
      [3, false, true],
    ]);
  });

  it("presença estornada por uma correção sai da soma e da contagem de presenças", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    const now = new Date();
    const original = await attendance(ana.user.id, now);
    await testPrisma.pointsEntry.create({
      data: {
        type: "REVERSAL",
        points: -10,
        clientId: ana.user.id,
        occurredAt: now,
        reversesEntryId: original.id,
      },
    });
    await attendance(bruno.user.id, now);

    const response = await ranking(ana.token, "week");

    // Ana ficou com 0 ponto líquido: não aparece.
    expect(summary(response.body)).toEqual([[1, "Bruno A."]]);
  });

  it("no desempate só contam as presenças que ainda valem, não as estornadas", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    const now = new Date();
    await attendance(ana.user.id, now);
    const reversed = await attendance(ana.user.id, now);
    await testPrisma.pointsEntry.create({
      data: {
        type: "REVERSAL",
        points: -10,
        clientId: ana.user.id,
        occurredAt: now,
        reversesEntryId: reversed.id,
      },
    });
    await goal(ana.user.id, now, 10);
    await attendance(bruno.user.id, now);
    await attendance(bruno.user.id, now);

    const response = await ranking(ana.token, "week");

    // Os dois somam 20 pontos, mas a Ana tem 1 presença válida e o Bruno 2.
    expect(
      response.body.entries.map((e: { name: string; points: number; attendances: number }) => [
        e.name,
        e.points,
        e.attendances,
      ]),
    ).toEqual([
      ["Bruno A.", 20, 2],
      ["Ana P.", 20, 1],
    ]);
  });

  it("clientes inativos não entram no ranking", async () => {
    const ana = await createClient("Ana Paula");
    const bruno = await createClient("Bruno Alves");
    await attendance(ana.user.id, new Date());
    await attendance(bruno.user.id, new Date());
    await testPrisma.user.update({ where: { id: bruno.user.id }, data: { status: "INACTIVE" } });

    const response = await ranking(ana.token, "week");

    expect(summary(response.body)).toEqual([[1, "Ana P."]]);
  });

  it("traz os 10 primeiros e, se a pessoa está fora deles, ela com a posição real", async () => {
    const clients = [];
    for (let index = 1; index <= 12; index++) {
      clients.push(await createClient(`Cliente Numero${String.fromCharCode(64 + index)}`));
    }
    const now = new Date();
    // O cliente i tem 13 - i presenças: o primeiro lidera e o último tem 1.
    for (const [index, client] of clients.entries()) {
      for (let n = 0; n < 12 - index; n++) await attendance(client.user.id, now);
    }

    const insideTop = await ranking(clients[0].token, "week");
    const outsideTop = await ranking(clients[11].token, "week");

    expect(insideTop.body.entries).toHaveLength(10);
    expect(insideTop.body.entries.some((entry: { isMe: boolean }) => entry.isMe)).toBe(true);
    expect(outsideTop.body.entries).toHaveLength(11);
    expect(outsideTop.body.entries[10]).toMatchObject({ position: 12, isMe: true, attendances: 1 });
    expect(outsideTop.body.entries[9].position).toBe(10);
  });

  it("sem lançamentos no período o ranking é vazio; o período padrão é a semana", async () => {
    const ana = await createClient("Ana Paula");

    const response = await ranking(ana.token);

    expect(response.status).toBe(200);
    expect(response.body.period).toBe("week");
    expect(response.body.entries).toEqual([]);
  });

  it("recusa período inválido e sessão ausente", async () => {
    const ana = await createClient("Ana Paula");

    const invalid = await ranking(ana.token, "ano");
    const anonymous = await request(app.getHttpServer()).get("/api/gamification/ranking");

    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION_ERROR");
    expect(anonymous.status).toBe(401);
  });
});
