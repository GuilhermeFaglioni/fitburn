import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { AttendanceMark } from "@fitburn/contracts";
import { seedGamificationRules } from "../src/gamification/default-rules.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import {
  createAccessProfile,
  createOccurrence,
  createReservation,
  createUser,
  grantModuleAccess,
} from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const HOUR = 60 * 60_000;

describe("Correção de presença: estorno e recálculo (HTTP)", () => {
  let app: INestApplication;
  let clientProfileId: string;
  let rafael: { user: { id: string }; token: string };
  let marina: { user: { id: string }; token: string };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await seedGamificationRules(testPrisma);
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    const professorProfile = await createAccessProfile({ name: "Professor" });
    await grantModuleAccess({
      profileId: professorProfile.id,
      module: "PRESENCA",
      actions: ["VIEW", "EXECUTE"],
      scope: "ASSIGNED_CLASSES",
    });
    rafael = await signIn("rafael", professorProfile.id);
    marina = await signIn("marina", clientProfileId);
  });

  async function signIn(name: string, profileId: string) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: name,
    });
    return { user, token: await loginAndGetAccessToken(app, user.email, PASSWORD) };
  }

  /** A n-ésima aula da série, de 2 em 2 horas, todas já iniciadas (a 1ª é a mais antiga). */
  function classNumber(n: number) {
    return createOccurrence(new Date(Date.now() - (40 - n) * 2 * HOUR), {
      instructorId: rafael.user.id,
    });
  }

  function mark(reservationId: string, status: AttendanceMark) {
    return request(app.getHttpServer())
      .post(`/api/attendance/reservations/${reservationId}`)
      .set("Authorization", `Bearer ${rafael.token}`)
      .send({ status });
  }

  /** Reserva (confirmada, ainda sem marcação) a aula n para a Marina. */
  async function reservationFor(n: number) {
    return createReservation(marina.user.id, (await classNumber(n)).id);
  }

  async function register(n: number, status: AttendanceMark) {
    const reservation = await reservationFor(n);
    expect((await mark(reservation.id, status)).status).toBe(200);
    return reservation;
  }

  async function summary() {
    const response = await request(app.getHttpServer())
      .get("/api/gamification/me")
      .set("Authorization", `Bearer ${marina.token}`);
    expect(response.status).toBe(200);
    return response.body;
  }

  const earnedMilestones = (body: { badges: Array<{ milestone: number; earned: boolean }> }) =>
    body.badges.filter((badge) => badge.earned).map((badge) => badge.milestone);

  /** Lançamentos de um tipo que ainda valem (nenhum estorno os desfez). */
  const liveEntries = (type: "ATTENDANCE" | "STREAK_BONUS") =>
    testPrisma.pointsEntry.findMany({ where: { type, reversedBy: null } });

  it("presente → faltou estorna os pontos da presença, sem apagar o lançamento original", async () => {
    const reservation = await register(1, "PRESENT");
    const original = await testPrisma.pointsEntry.findFirstOrThrow({
      where: { type: "ATTENDANCE" },
    });

    const corrected = await mark(reservation.id, "ABSENT");
    const body = await summary();

    expect(corrected.status).toBe(200);
    expect(body.totalPoints).toBe(0);
    expect(body.streak.current).toBe(0);
    const entries = await testPrisma.pointsEntry.findMany({ orderBy: { sequence: "asc" } });
    expect(entries.map((entry) => [entry.type, entry.points])).toEqual([
      ["ATTENDANCE", 10],
      ["REVERSAL", -10],
    ]);
    expect(entries[1].reversesEntryId).toBe(original.id);
    // O estorno fica no mesmo instante do evento: os rankings por período fecham a conta.
    expect(entries[1].occurredAt).toEqual(original.occurredAt);
    expect(entries[1].reservationId).toBe(reservation.id);
    expect(
      body.history.map((item: { type: string; points: number }) => [item.type, item.points]),
    ).toEqual([
      ["REVERSAL", -10],
      ["ATTENDANCE", 10],
    ]);
  });

  it("faltou → presente lança os pontos da presença", async () => {
    const reservation = await register(1, "ABSENT");
    expect((await summary()).totalPoints).toBe(0);

    await mark(reservation.id, "PRESENT");
    const body = await summary();

    expect(body.totalPoints).toBe(10);
    expect(body.streak.current).toBe(1);
    expect(await liveEntries("ATTENDANCE")).toHaveLength(1);
  });

  it("corrigir de novo e de novo mantém a conta certa: uma única presença viva", async () => {
    const reservation = await register(1, "PRESENT");

    await mark(reservation.id, "ABSENT");
    await mark(reservation.id, "PRESENT");
    await mark(reservation.id, "ABSENT");
    await mark(reservation.id, "PRESENT");
    const body = await summary();

    expect(body.totalPoints).toBe(10);
    expect(await liveEntries("ATTENDANCE")).toHaveLength(1);
    // Três presenças lançadas, duas delas estornadas.
    expect(await testPrisma.pointsEntry.count({ where: { type: "ATTENDANCE" } })).toBe(3);
    expect(await testPrisma.pointsEntry.count({ where: { type: "REVERSAL" } })).toBe(2);
  });

  it("marcar de novo o mesmo estado não lança nada", async () => {
    const reservation = await register(1, "PRESENT");

    await mark(reservation.id, "PRESENT");

    expect((await summary()).totalPoints).toBe(10);
    expect(await testPrisma.pointsEntry.count()).toBe(1);
  });

  it("presente → faltou no meio de uma sequência premiada estorna o bônus e desfaz o badge", async () => {
    await register(1, "PRESENT");
    const middle = await register(2, "PRESENT");
    await register(3, "PRESENT");
    const before = await summary();

    await mark(middle.id, "ABSENT");
    const body = await summary();

    expect(before.totalPoints).toBe(35);
    expect(earnedMilestones(before)).toEqual([3]);
    // Restam 2 presenças (20); o bônus de 5 e a presença corrigida (10) foram estornados.
    expect(body.totalPoints).toBe(20);
    expect(body.streak.current).toBe(1);
    expect(earnedMilestones(body)).toEqual([]);
    expect(await liveEntries("STREAK_BONUS")).toHaveLength(0);
    const reversedBonus = await testPrisma.pointsEntry.findFirstOrThrow({
      where: { type: "REVERSAL", milestone: 3 },
      include: { reversesEntry: true },
    });
    expect(reversedBonus.points).toBe(-5);
    expect(reversedBonus.reversesEntry?.type).toBe("STREAK_BONUS");
    expect(reversedBonus.occurredAt).toEqual(reversedBonus.reversesEntry?.occurredAt);
  });

  it("faltou → presente que une duas sequências dá os bônus da sequência maior", async () => {
    await register(1, "PRESENT");
    await register(2, "PRESENT");
    const absence = await register(3, "ABSENT");
    await register(4, "PRESENT");
    await register(5, "PRESENT");
    const before = await summary();

    await mark(absence.id, "PRESENT");
    const body = await summary();

    expect(before.totalPoints).toBe(40);
    // A 5ª presença (10) e os bônus dos marcos 3 (5) e 5 (10).
    expect(body.totalPoints).toBe(40 + 10 + 5 + 10);
    expect(body.streak.current).toBe(5);
    expect(earnedMilestones(body)).toEqual([3, 5]);
  });

  it("duas sequências premiadas que se fundem pagam o marco uma vez só", async () => {
    for (const n of [1, 2, 3]) await register(n, "PRESENT");
    const absence = await register(4, "ABSENT");
    for (const n of [5, 6, 7]) await register(n, "PRESENT");
    const before = await summary();

    await mark(absence.id, "PRESENT");
    const body = await summary();

    // Antes: 6 presenças + 2 bônus do marco 3. Depois: 7 presenças, 1 bônus do 3 e 1 do 5.
    expect(before.totalPoints).toBe(60 + 5 + 5);
    expect(body.totalPoints).toBe(70 + 5 + 10);
    expect(body.streak.current).toBe(7);
    const live = await liveEntries("STREAK_BONUS");
    expect(live.map((entry) => entry.milestone).sort()).toEqual([3, 5]);
  });

  it("uma falta registrada tarde no meio de uma sequência já premiada estorna o bônus", async () => {
    const reservations = [];
    for (const n of [1, 2, 3, 4]) reservations.push(await reservationFor(n));
    for (const index of [0, 2, 3]) await mark(reservations[index].id, "PRESENT");
    const before = await summary();

    await mark(reservations[1].id, "ABSENT");
    const body = await summary();

    expect(before.totalPoints).toBe(35);
    expect(body.totalPoints).toBe(30);
    expect(body.streak.current).toBe(2);
    expect(earnedMilestones(body)).toEqual([]);
  });

  it("uma correção que não desfaz a sequência mantém o bônus e o badge", async () => {
    for (const n of [1, 2, 3, 4]) await register(n, "PRESENT");
    const fifth = await register(5, "ABSENT");

    await mark(fifth.id, "PRESENT");
    const body = await summary();

    expect(body.totalPoints).toBe(50 + 5 + 10);
    expect(earnedMilestones(body)).toEqual([3, 5]);
    expect(await liveEntries("STREAK_BONUS")).toHaveLength(2);
  });

  it("um marco removido da configuração não tem os bônus antigos estornados", async () => {
    for (const n of [1, 2, 3]) await register(n, "PRESENT");
    await testPrisma.gamificationRule.delete({
      where: { kind_threshold: { kind: "STREAK_MILESTONE", threshold: 3 } },
    });

    await register(4, "PRESENT");
    const body = await summary();

    // O bônus de 5 pontos do marco 3 continua no total: 4 presenças + 5.
    expect(body.totalPoints).toBe(45);
    expect(await liveEntries("STREAK_BONUS")).toHaveLength(1);
  });

  it("o badge desfeito por uma correção fica como revogado e volta quando uma nova sequência alcança o marco", async () => {
    await register(1, "PRESENT");
    const middle = await register(2, "PRESENT");
    await register(3, "PRESENT");
    const earned = await testPrisma.streakBadge.findFirstOrThrow({ where: { milestone: 3 } });

    await mark(middle.id, "ABSENT");
    const revoked = await testPrisma.streakBadge.findFirstOrThrow({ where: { milestone: 3 } });
    const whileRevoked = await summary();
    await mark(middle.id, "PRESENT");
    const reactivated = await testPrisma.streakBadge.findFirstOrThrow({ where: { milestone: 3 } });
    const afterwards = await summary();

    // A linha continua (com o histórico de quando foi conquistado); só deixa de valer.
    expect(revoked.id).toBe(earned.id);
    expect(revoked.awardedAt).toEqual(earned.awardedAt);
    expect(revoked.revokedAt).not.toBeNull();
    expect(earnedMilestones(whileRevoked)).toEqual([]);
    expect(reactivated.id).toBe(earned.id);
    expect(reactivated.revokedAt).toBeNull();
    expect(earnedMilestones(afterwards)).toEqual([3]);
    expect(await testPrisma.streakBadge.count()).toBe(1);
  });

  it("uma regra nova na configuração vale para a sequência da marcação, não repaga as antigas", async () => {
    for (const n of [1, 2, 3, 4, 5]) await register(n, "PRESENT");
    await register(6, "ABSENT");
    await testPrisma.gamificationRule.create({
      data: { kind: "STREAK_MILESTONE", threshold: 4, points: 7 },
    });

    // Uma marcação noutra sequência: a sequência antiga (5 presenças) não ganha o marco 4.
    await register(7, "PRESENT");
    const body = await summary();

    expect(body.totalPoints).toBe(50 + 5 + 10 + 10);
    expect(await testPrisma.pointsEntry.count({ where: { milestone: 4 } })).toBe(0);
  });

  it("um lançamento é estornado no máximo uma vez", async () => {
    const reservation = await register(1, "PRESENT");
    await mark(reservation.id, "ABSENT");
    const original = await testPrisma.pointsEntry.findFirstOrThrow({
      where: { type: "ATTENDANCE" },
    });

    await expect(
      testPrisma.pointsEntry.create({
        data: {
          type: "REVERSAL",
          points: -10,
          clientId: marina.user.id,
          occurredAt: original.occurredAt,
          reversesEntryId: original.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("recusa a correção de uma reserva cancelada e não mexe nos pontos", async () => {
    const cancelled = await createReservation(
      marina.user.id,
      (await classNumber(1)).id,
      "CANCELLED",
    );

    const response = await mark(cancelled.id, "PRESENT");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("RESERVATION_NOT_ATTENDABLE");
    expect(await testPrisma.pointsEntry.count()).toBe(0);
  });
});
