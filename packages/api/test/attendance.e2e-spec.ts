import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { gymDateTimeToUtc } from "@fitburn/contracts";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import {
  createAccessProfile,
  createOccurrence,
  createReservation as reserve,
  createUser,
  grantModuleAccess,
} from "./factories.js";
import { seedGamificationRules } from "../src/gamification/default-rules.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const MINUTE = 60_000;

describe("Presença (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let professorProfileId: string;
  let clientProfileId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await seedGamificationRules(testPrisma);
    adminProfileId = (await createAccessProfile({ name: "Administrador", isSystem: true })).id;
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    professorProfileId = (await createAccessProfile({ name: "Professor" })).id;
    await grantModuleAccess({
      profileId: professorProfileId,
      module: "PRESENCA",
      actions: ["VIEW", "EXECUTE"],
      scope: "ASSIGNED_CLASSES",
    });
  });

  async function signIn(name: string, profileId: string) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: name,
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { user, token };
  }

  const createProfessor = (name: string) => signIn(name, professorProfileId);
  const createAdmin = (name = "admin") => signIn(name, adminProfileId);
  const createClient = (name: string) => signIn(name, clientProfileId);

  function listClasses(token: string, from: string, to: string) {
    return request(app.getHttpServer())
      .get(`/api/attendance/classes?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${token}`);
  }

  describe("Minhas aulas (listagem por período)", () => {
    it("lista só as aulas do professor no período, em ordem de horário, com o andamento do registro", async () => {
      const rafael = await createProfessor("rafael");
      const outro = await createProfessor("outro");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const camila = await createClient("camila");

      const evening = await createOccurrence(gymDateTimeToUtc("2026-05-04", "18:00"), {
        instructorId: rafael.user.id,
        name: "Treino Funcional",
      });
      const morning = await createOccurrence(gymDateTimeToUtc("2026-05-04", "07:00"), {
        instructorId: rafael.user.id,
        name: "Spinning",
      });
      await createOccurrence(gymDateTimeToUtc("2026-05-04", "09:00"), {
        instructorId: outro.user.id,
      });
      await createOccurrence(gymDateTimeToUtc("2026-05-05", "07:00"), {
        instructorId: rafael.user.id,
      });
      await createOccurrence(gymDateTimeToUtc("2026-05-04", "12:00"), {
        instructorId: rafael.user.id,
        status: "CANCELLED",
      });
      await testPrisma.reservation.createMany({
        data: [
          { clientId: marina.user.id, occurrenceId: evening.id, status: "COMPLETED" },
          { clientId: bruno.user.id, occurrenceId: evening.id, status: "CONFIRMED" },
          { clientId: camila.user.id, occurrenceId: evening.id, status: "CANCELLED" },
        ],
      });

      const response = await listClasses(rafael.token, "2026-05-04", "2026-05-04");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        id: morning.id,
        name: "Spinning",
        startsAt: gymDateTimeToUtc("2026-05-04", "07:00").toISOString(),
        modality: { name: "Spinning" },
        instructor: { id: rafael.user.id, fullName: "rafael" },
        registeredCount: 0,
        totalCount: 0,
      });
      // Canceladas não contam: 2 alunos com reserva viva, 1 já registrado.
      expect(response.body[1]).toMatchObject({
        id: evening.id,
        registeredCount: 1,
        totalCount: 2,
      });
    });

    it("filtra o período pelo dia da academia, não pelo dia UTC", async () => {
      const rafael = await createProfessor("rafael");
      // 22h30 em São Paulo já é 01h30 UTC do dia seguinte; 00h30 local ainda é 03h30 UTC do mesmo dia.
      const lateNight = await createOccurrence(gymDateTimeToUtc("2026-05-04", "22:30"), {
        instructorId: rafael.user.id,
      });
      const justAfterMidnight = await createOccurrence(gymDateTimeToUtc("2026-05-05", "00:30"), {
        instructorId: rafael.user.id,
      });

      const monday = await listClasses(rafael.token, "2026-05-04", "2026-05-04");
      const tuesday = await listClasses(rafael.token, "2026-05-05", "2026-05-05");

      expect(monday.body.map((item: { id: string }) => item.id)).toEqual([lateNight.id]);
      expect(tuesday.body.map((item: { id: string }) => item.id)).toEqual([justAfterMidnight.id]);
    });

    it("o administrador vê as aulas de todos os professores", async () => {
      const rafael = await createProfessor("rafael");
      const outro = await createProfessor("outro");
      const admin = await createAdmin();
      await createOccurrence(gymDateTimeToUtc("2026-05-04", "07:00"), {
        instructorId: rafael.user.id,
      });
      await createOccurrence(gymDateTimeToUtc("2026-05-04", "09:00"), {
        instructorId: outro.user.id,
      });

      const response = await listClasses(admin.token, "2026-05-04", "2026-05-04");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it("recusa quem não tem permissão de presença e quem não está autenticado", async () => {
      const marina = await createClient("marina");

      const forbidden = await listClasses(marina.token, "2026-05-04", "2026-05-04");
      const anonymous = await request(app.getHttpServer()).get(
        "/api/attendance/classes?from=2026-05-04&to=2026-05-04",
      );

      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe("FORBIDDEN");
      expect(anonymous.status).toBe(401);
    });

    it("recusa um período inválido", async () => {
      const rafael = await createProfessor("rafael");

      const response = await listClasses(rafael.token, "ontem", "hoje");

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });
  });
  function roster(token: string, occurrenceId: string) {
    return request(app.getHttpServer())
      .get(`/api/attendance/classes/${occurrenceId}`)
      .set("Authorization", `Bearer ${token}`);
  }

  function mark(token: string, reservationId: string, status: unknown) {
    return request(app.getHttpServer())
      .post(`/api/attendance/reservations/${reservationId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status });
  }

  /** Uma aula que começou há 30 minutos (a presença já está aberta). */
  const startedRecently = () => new Date(Date.now() - 30 * MINUTE);

  async function statusOf(reservationId: string) {
    const reservation = await testPrisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    return reservation.status;
  }

  describe("Lista de presença de uma aula", () => {
    it("mostra os clientes com reserva viva em ordem alfabética, com a situação de cada um", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const camila = await createClient("camila");
      const diego = await createClient("diego");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const marinaReservation = await reserve(marina.user.id, occurrence.id, "COMPLETED");
      const brunoReservation = await reserve(bruno.user.id, occurrence.id, "CONFIRMED");
      await reserve(camila.user.id, occurrence.id, "CANCELLED");
      const diegoReservation = await reserve(diego.user.id, occurrence.id, "NO_SHOW");

      const response = await roster(rafael.token, occurrence.id);

      expect(response.status).toBe(200);
      expect(response.body.class).toMatchObject({
        id: occurrence.id,
        name: "Treino Funcional",
        totalCount: 3,
        registeredCount: 2,
      });
      expect(response.body.entries).toEqual([
        {
          reservationId: brunoReservation.id,
          client: { id: bruno.user.id, fullName: "bruno" },
          status: "PENDING",
        },
        {
          reservationId: diegoReservation.id,
          client: { id: diego.user.id, fullName: "diego" },
          status: "ABSENT",
        },
        {
          reservationId: marinaReservation.id,
          client: { id: marina.user.id, fullName: "marina" },
          status: "PRESENT",
        },
      ]);
    });

    it("recusa o professor de outra aula e responde 404 para aula inexistente; o administrador vê qualquer aula", async () => {
      const rafael = await createProfessor("rafael");
      const outro = await createProfessor("outro");
      const admin = await createAdmin();
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });

      const outOfScope = await roster(outro.token, occurrence.id);
      const missing = await roster(rafael.token, "nao-existe");
      const asAdmin = await roster(admin.token, occurrence.id);

      expect(outOfScope.status).toBe(403);
      expect(outOfScope.body.code).toBe("OUT_OF_SCOPE");
      expect(missing.status).toBe(404);
      expect(asAdmin.status).toBe(200);
    });
  });

  describe("Registro de presença", () => {
    it("presente conclui a reserva e faltou a marca como não compareceu", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const marinaReservation = await reserve(marina.user.id, occurrence.id);
      const brunoReservation = await reserve(bruno.user.id, occurrence.id);

      const present = await mark(rafael.token, marinaReservation.id, "PRESENT");
      const absent = await mark(rafael.token, brunoReservation.id, "ABSENT");

      expect(present.status).toBe(200);
      expect(present.body).toEqual({
        reservationId: marinaReservation.id,
        client: { id: marina.user.id, fullName: "marina" },
        status: "PRESENT",
      });
      expect(absent.status).toBe(200);
      expect(absent.body.status).toBe("ABSENT");
      expect(await statusOf(marinaReservation.id)).toBe("COMPLETED");
      expect(await statusOf(brunoReservation.id)).toBe("NO_SHOW");

      const after = await roster(rafael.token, occurrence.id);
      expect(after.body.class).toMatchObject({ totalCount: 2, registeredCount: 2 });
    });

    it("só abre a partir do início da aula", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(new Date(Date.now() + 10 * MINUTE), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const response = await mark(rafael.token, reservation.id, "PRESENT");

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ATTENDANCE_NOT_OPEN");
      expect(await statusOf(reservation.id)).toBe("CONFIRMED");
    });

    it("recusa reserva cancelada", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const cancelled = await reserve(marina.user.id, occurrence.id, "CANCELLED");

      const response = await mark(rafael.token, cancelled.id, "PRESENT");

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("RESERVATION_NOT_ATTENDABLE");
      expect(await statusOf(cancelled.id)).toBe("CANCELLED");
    });

    it("corrige a marcação: presente vira faltou e faltou vira presente", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const wasPresent = await reserve(marina.user.id, occurrence.id, "COMPLETED");
      const wasAbsent = await reserve(bruno.user.id, occurrence.id, "NO_SHOW");

      const toAbsent = await mark(rafael.token, wasPresent.id, "ABSENT");
      const toPresent = await mark(rafael.token, wasAbsent.id, "PRESENT");

      expect(toAbsent.status).toBe(200);
      expect(toAbsent.body.status).toBe("ABSENT");
      expect(toPresent.status).toBe(200);
      expect(toPresent.body.status).toBe("PRESENT");
      expect(await statusOf(wasPresent.id)).toBe("NO_SHOW");
      expect(await statusOf(wasAbsent.id)).toBe("COMPLETED");
    });

    it("marcar de novo o mesmo estado é aceito e não muda nada", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const first = await mark(rafael.token, reservation.id, "PRESENT");
      const again = await mark(rafael.token, reservation.id, "PRESENT");

      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(again.body.status).toBe("PRESENT");
      expect(await statusOf(reservation.id)).toBe("COMPLETED");
    });

    it("recusa o professor de outra aula", async () => {
      const rafael = await createProfessor("rafael");
      const outro = await createProfessor("outro");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const response = await mark(outro.token, reservation.id, "PRESENT");

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
      expect(await statusOf(reservation.id)).toBe("CONFIRMED");
    });

    it("recusa quem deixou de ser o professor da aula (substituído)", async () => {
      const rafael = await createProfessor("rafael");
      const outro = await createProfessor("outro");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);
      await testPrisma.classOccurrence.update({
        where: { id: occurrence.id },
        data: { instructorId: outro.user.id },
      });

      const byReplaced = await mark(rafael.token, reservation.id, "PRESENT");
      const bySubstitute = await mark(outro.token, reservation.id, "PRESENT");

      expect(byReplaced.status).toBe(403);
      expect(byReplaced.body.code).toBe("OUT_OF_SCOPE");
      expect(bySubstitute.status).toBe(200);
    });

    it("o administrador registra presença em qualquer aula", async () => {
      const rafael = await createProfessor("rafael");
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const response = await mark(admin.token, reservation.id, "PRESENT");

      expect(response.status).toBe(200);
      expect(await statusOf(reservation.id)).toBe("COMPLETED");
    });

    it("recusa cliente, sessão ausente, corpo inválido e reserva inexistente", async () => {
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const asClient = await mark(marina.token, reservation.id, "PRESENT");
      const anonymous = await request(app.getHttpServer())
        .post(`/api/attendance/reservations/${reservation.id}`)
        .send({ status: "PRESENT" });
      const invalid = await mark(rafael.token, reservation.id, "CONFIRMED");
      const missing = await mark(rafael.token, "nao-existe", "PRESENT");

      expect(asClient.status).toBe(403);
      expect(asClient.body.code).toBe("FORBIDDEN");
      expect(anonymous.status).toBe(401);
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe("VALIDATION_ERROR");
      expect(missing.status).toBe(404);
      expect(await statusOf(reservation.id)).toBe("CONFIRMED");
    });

    it("recusa quem só pode ver a presença (sem a ação de executar)", async () => {
      const viewerProfile = await createAccessProfile({ name: "Coordenador" });
      await grantModuleAccess({
        profileId: viewerProfile.id,
        module: "PRESENCA",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const viewer = await signIn("coordenador", viewerProfile.id);
      const rafael = await createProfessor("rafael");
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const listed = await roster(viewer.token, occurrence.id);
      const response = await mark(viewer.token, reservation.id, "PRESENT");

      expect(listed.status).toBe(200);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect(await statusOf(reservation.id)).toBe("CONFIRMED");
    });

    it("dois registros simultâneos iguais na mesma reserva: os pontos entram uma vez só", async () => {
      const rafael = await createProfessor("rafael");
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const [byProfessor, byAdmin] = await Promise.all([
        mark(rafael.token, reservation.id, "PRESENT"),
        mark(admin.token, reservation.id, "PRESENT"),
      ]);

      expect([byProfessor.status, byAdmin.status]).toEqual([200, 200]);
      expect(await statusOf(reservation.id)).toBe("COMPLETED");
      expect(await testPrisma.pointsEntry.count()).toBe(1);
    });

    it("presente e faltou simultâneos na mesma reserva: valem em fila e os pontos batem com o estado final", async () => {
      const rafael = await createProfessor("rafael");
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const occurrence = await createOccurrence(startedRecently(), {
        instructorId: rafael.user.id,
      });
      const reservation = await reserve(marina.user.id, occurrence.id);

      const [asPresent, asAbsent] = await Promise.all([
        mark(rafael.token, reservation.id, "PRESENT"),
        mark(admin.token, reservation.id, "ABSENT"),
      ]);

      expect([asPresent.status, asAbsent.status]).toEqual([200, 200]);
      const finalStatus = await statusOf(reservation.id);
      const entries = await testPrisma.pointsEntry.findMany();
      const total = entries.reduce((sum, entry) => sum + entry.points, 0);
      expect(total).toBe(finalStatus === "COMPLETED" ? 10 : 0);
    });
  });
});
