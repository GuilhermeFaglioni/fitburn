import type { INestApplication } from "@nestjs/common";
import request from "supertest";
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

describe("Gamificação: streak, bônus e badges (HTTP)", () => {
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
  function classNumber(n: number, name = "Treino Funcional") {
    return createOccurrence(new Date(Date.now() - (40 - n) * 2 * HOUR), {
      instructorId: rafael.user.id,
      name,
    });
  }

  function mark(token: string, reservationId: string, status: "PRESENT" | "ABSENT") {
    return request(app.getHttpServer())
      .post(`/api/attendance/reservations/${reservationId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status });
  }

  /** Reserva a aula n para a Marina e registra a presença (ou falta) nela. */
  async function attend(n: number, status: "PRESENT" | "ABSENT" = "PRESENT") {
    const reservation = await createReservation(marina.user.id, (await classNumber(n)).id);
    const response = await mark(rafael.token, reservation.id, status);
    expect(response.status).toBe(200);
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

  it("sem presenças o streak é zero, o próximo marco é o primeiro e todos os badges estão bloqueados", async () => {
    const body = await summary();

    expect(body.streak).toEqual({ current: 0, next: { threshold: 3, bonusPoints: 5 } });
    expect(body.badges).toEqual([
      { milestone: 3, earned: false, awardedAt: null },
      { milestone: 5, earned: false, awardedAt: null },
      { milestone: 10, earned: false, awardedAt: null },
    ]);
  });

  it("3 presenças seguidas: bônus de 5 pontos e badge do marco 3", async () => {
    await attend(1);
    await attend(2);
    const before = await summary();
    const third = await attend(3);
    const body = await summary();

    expect(before.totalPoints).toBe(20);
    expect(before.streak.current).toBe(2);
    expect(before.history.some((item: { type: string }) => item.type === "STREAK_BONUS")).toBe(
      false,
    );
    // 3 presenças de 10 pontos + o bônus do marco 3.
    expect(body.totalPoints).toBe(35);
    expect(body.streak).toEqual({ current: 3, next: { threshold: 5, bonusPoints: 10 } });
    expect(earnedMilestones(body)).toEqual([3]);
    expect(body.history[0]).toMatchObject({ type: "STREAK_BONUS", points: 5, milestone: 3 });
    expect(body.history[1]).toMatchObject({ type: "ATTENDANCE", points: 10 });
    const bonus = await testPrisma.pointsEntry.findFirstOrThrow({
      where: { type: "STREAK_BONUS" },
    });
    expect(bonus.reservationId).toBe(third.id);
  });

  it("os marcos 5 e 10 dão 10 e 20 pontos, e cada badge é conquistado uma vez", async () => {
    for (let n = 1; n <= 10; n++) await attend(n);

    const body = await summary();

    // 10 presenças + bônus 5 + 10 + 20.
    expect(body.totalPoints).toBe(100 + 5 + 10 + 20);
    expect(body.streak).toEqual({ current: 10, next: null });
    expect(earnedMilestones(body)).toEqual([3, 5, 10]);
    const bonuses = await testPrisma.pointsEntry.findMany({
      where: { type: "STREAK_BONUS" },
      orderBy: { milestone: "asc" },
    });
    expect(bonuses.map((entry) => [entry.milestone, entry.points])).toEqual([
      [3, 5],
      [5, 10],
      [10, 20],
    ]);
  });

  it("uma falta zera o streak; a nova sequência dá o bônus de novo, mas o badge continua um só", async () => {
    await attend(1);
    await attend(2);
    await attend(3);
    await attend(4, "ABSENT");
    const afterAbsence = await summary();
    await attend(5);
    await attend(6);
    await attend(7);
    const body = await summary();

    expect(afterAbsence.streak).toEqual({ current: 0, next: { threshold: 3, bonusPoints: 5 } });
    expect(afterAbsence.totalPoints).toBe(35);
    // 6 presenças + o bônus do marco 3 nas duas sequências.
    expect(body.totalPoints).toBe(60 + 5 + 5);
    expect(body.streak.current).toBe(3);
    expect(await testPrisma.streakBadge.count({ where: { milestone: 3 } })).toBe(1);
    expect(await testPrisma.pointsEntry.count({ where: { type: "STREAK_BONUS" } })).toBe(2);
  });

  it("cancelamento e reserva ainda não marcada são neutros: não zeram nem contam", async () => {
    await attend(1);
    await attend(2);
    await createReservation(marina.user.id, (await classNumber(3)).id, "CANCELLED");
    await createReservation(marina.user.id, (await classNumber(4)).id, "CONFIRMED");
    await attend(5);

    const body = await summary();

    expect(body.streak.current).toBe(3);
    expect(body.totalPoints).toBe(35);
    expect(earnedMilestones(body)).toEqual([3]);
  });

  it("o streak segue a ordem das aulas, não a ordem em que a presença foi registrada", async () => {
    const reservations = [];
    for (const n of [1, 2, 3]) {
      reservations.push(await createReservation(marina.user.id, (await classNumber(n)).id));
    }

    await mark(rafael.token, reservations[2].id, "PRESENT");
    await mark(rafael.token, reservations[0].id, "PRESENT");
    const before = await summary();
    await mark(rafael.token, reservations[1].id, "PRESENT");
    const body = await summary();

    // A aula do meio ainda não foi marcada (neutra): as outras duas já formam uma sequência de 2.
    expect(before.streak.current).toBe(2);
    expect(before.totalPoints).toBe(20);
    expect(body.streak.current).toBe(3);
    expect(body.totalPoints).toBe(35);
    expect(await testPrisma.pointsEntry.count({ where: { type: "STREAK_BONUS" } })).toBe(1);
  });

  it("uma presença que entra no meio de uma sequência já premiada não paga o bônus de novo", async () => {
    const reservations = [];
    for (const n of [1, 2, 3, 4]) {
      reservations.push(await createReservation(marina.user.id, (await classNumber(n)).id));
    }
    for (const index of [0, 1, 3]) await mark(rafael.token, reservations[index].id, "PRESENT");
    const before = await summary();

    // A 3ª aula é marcada por último: agora ela é que completa o marco 3, mas a sequência já foi paga.
    await mark(rafael.token, reservations[2].id, "PRESENT");
    const body = await summary();

    expect(before.totalPoints).toBe(35);
    expect(body.totalPoints).toBe(45);
    expect(body.streak.current).toBe(4);
    expect(await testPrisma.pointsEntry.count({ where: { type: "STREAK_BONUS" } })).toBe(1);
  });

  it("cada cliente tem o seu streak e os seus badges", async () => {
    const bruno = await signIn("bruno", clientProfileId);
    await attend(1);
    await attend(2);
    for (const n of [3, 4, 5]) {
      const reservation = await createReservation(bruno.user.id, (await classNumber(n)).id);
      await mark(rafael.token, reservation.id, "PRESENT");
    }

    const marinaSummary = await summary();
    const brunoSummary = (
      await request(app.getHttpServer())
        .get("/api/gamification/me")
        .set("Authorization", `Bearer ${bruno.token}`)
    ).body;

    expect(marinaSummary.streak.current).toBe(2);
    expect(earnedMilestones(marinaSummary)).toEqual([]);
    expect(brunoSummary.streak.current).toBe(3);
    expect(earnedMilestones(brunoSummary)).toEqual([3]);
    expect(brunoSummary.totalPoints).toBe(35);
  });

  it("a equipe vê o streak e os badges do cliente", async () => {
    const admin = await signIn(
      "admin",
      (await createAccessProfile({ name: "Administrador", isSystem: true })).id,
    );
    for (let n = 1; n <= 3; n++) await attend(n);

    const response = await request(app.getHttpServer())
      .get(`/api/gamification/clients/${marina.user.id}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(response.status).toBe(200);
    expect(response.body.streak).toEqual({ current: 3, next: { threshold: 5, bonusPoints: 10 } });
    expect(earnedMilestones(response.body)).toEqual([3]);
  });

  it("os marcos e os bônus vêm da configuração no banco", async () => {
    await testPrisma.gamificationRule.update({
      where: { kind_threshold: { kind: "STREAK_MILESTONE", threshold: 3 } },
      data: { points: 8 },
    });
    await testPrisma.gamificationRule.delete({
      where: { kind_threshold: { kind: "STREAK_MILESTONE", threshold: 5 } },
    });
    await testPrisma.gamificationRule.create({
      data: { kind: "STREAK_MILESTONE", threshold: 4, points: 7 },
    });

    for (let n = 1; n <= 5; n++) await attend(n);
    const body = await summary();

    // 5 presenças + bônus do 3 (8) + bônus do 4 (7); o marco 5 não existe mais.
    expect(body.totalPoints).toBe(50 + 8 + 7);
    expect(body.badges.map((badge: { milestone: number }) => badge.milestone)).toEqual([3, 4, 10]);
    expect(earnedMilestones(body)).toEqual([3, 4]);
    expect(body.streak).toEqual({ current: 5, next: { threshold: 10, bonusPoints: 20 } });
  });

  it("registros simultâneos em aulas diferentes do mesmo cliente não perdem o bônus", async () => {
    await attend(1);
    const second = await createReservation(marina.user.id, (await classNumber(2)).id);
    const third = await createReservation(marina.user.id, (await classNumber(3)).id);

    const [a, b] = await Promise.all([
      mark(rafael.token, second.id, "PRESENT"),
      mark(rafael.token, third.id, "PRESENT"),
    ]);
    const body = await summary();

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(body.streak.current).toBe(3);
    expect(body.totalPoints).toBe(35);
    expect(await testPrisma.pointsEntry.count({ where: { type: "STREAK_BONUS" } })).toBe(1);
  });

  it("o histórico e o badge trazem o horário da aula que completou a sequência", async () => {
    await attend(1);
    await attend(2);
    const third = await attend(3);
    const occurrence = await testPrisma.classOccurrence.findUniqueOrThrow({
      where: { id: third.occurrenceId },
    });

    const body = await summary();

    expect(body.history[0]).toMatchObject({
      type: "STREAK_BONUS",
      occurredAt: occurrence.startsAt.toISOString(),
    });
    expect(body.badges[0]).toEqual({
      milestone: 3,
      earned: true,
      awardedAt: occurrence.startsAt.toISOString(),
    });
  });
});
