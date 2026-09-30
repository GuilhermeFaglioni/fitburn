import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  cleanDatabase,
  dropOccurrenceNoOverlapConstraint,
  ensureOccurrenceNoOverlapConstraint,
  testPrisma,
} from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("Reservas (HTTP)", () => {
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
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    clientProfileId = profile.id;
  });

  async function createClient(name: string, overrides: { status?: "ACTIVE" | "INACTIVE" } = {}) {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId: clientProfileId,
      fullName: name,
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    if (overrides.status) {
      await testPrisma.user.update({ where: { id: user.id }, data: { status: overrides.status } });
    }
    return { user, token };
  }

  async function createOccurrence(
    startsAt: Date,
    overrides: { status?: "SCHEDULED" | "CANCELLED"; capacity?: number; name?: string } = {},
  ) {
    const name = overrides.name ?? "Spinning";
    const modality = await testPrisma.modality.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    const template = await testPrisma.classTemplate.create({
      data: { name, durationMinutes: 60, capacity: 12, modalityId: modality.id },
    });
    return testPrisma.classOccurrence.create({
      data: {
        templateId: template.id,
        modalityId: modality.id,
        name,
        durationMinutes: 60,
        capacity: overrides.capacity ?? 12,
        status: overrides.status ?? "SCHEDULED",
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR),
      },
    });
  }

  function reserve(token: string, occurrenceId: string, key: string = randomUUID()) {
    return request(app.getHttpServer())
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ occurrenceId });
  }

  function cancel(token: string, reservationId: string) {
    return request(app.getHttpServer())
      .post(`/api/reservations/${reservationId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
  }

  function reschedule(
    token: string,
    reservationId: string,
    occurrenceId: string,
    key: string = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post(`/api/reservations/${reservationId}/reschedule`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ occurrenceId });
  }

  async function statusOf(reservationId: string) {
    const reservation = await testPrisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    return reservation.status;
  }

  function listMine(token: string, query = "") {
    return request(app.getHttpServer())
      .get(`/api/reservations${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  function agendaItem(token: string, occurrenceId: string) {
    return request(app.getHttpServer())
      .get(`/api/agenda/${occurrenceId}`)
      .set("Authorization", `Bearer ${token}`);
  }

  describe("reservar aula", () => {
    it("confirma a reserva na hora e desconta a vaga da agenda", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 5 });

      const response = await reserve(ana.token, occurrence.id);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: "CONFIRMED",
        cancelledAt: null,
        occurrence: { id: occurrence.id, name: "Spinning", modality: { name: "Spinning" } },
      });

      const mine = await agendaItem(ana.token, occurrence.id);
      expect(mine.body).toMatchObject({ available: 4, myReservationId: response.body.id });
      const theirs = await agendaItem(bruno.token, occurrence.id);
      expect(theirs.body).toMatchObject({ available: 4, myReservationId: null });
    });

    it("a lista da agenda também desconta as reservas confirmadas", async () => {
      const ana = await createClient("ana");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const occurrence = await createOccurrence(startsAt, { capacity: 5 });
      await reserve(ana.token, occurrence.id);

      const day = startsAt.toISOString().slice(0, 10);
      const from = new Date(startsAt.getTime() - 48 * HOUR).toISOString().slice(0, 10);
      const response = await request(app.getHttpServer())
        .get(`/api/agenda?from=${from}&to=${day}`)
        .set("Authorization", `Bearer ${ana.token}`);

      expect(response.body).toEqual([
        expect.objectContaining({
          id: occurrence.id,
          available: 4,
          myReservationId: expect.any(String),
        }),
      ]);
    });

    it("recusa aula cheia com CLASS_FULL e as vagas atuais", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 1 });
      await reserve(ana.token, occurrence.id);

      const response = await reserve(bruno.token, occurrence.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "CLASS_FULL",
        details: { currentAvailableSpots: 0 },
      });
    });

    it("recusa uma segunda reserva do mesmo cliente na mesma aula com DUPLICATE_RESERVATION", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 2 });
      await reserve(ana.token, occurrence.id);

      const response = await reserve(ana.token, occurrence.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("DUPLICATE_RESERVATION");
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("recusa aula cancelada ou já iniciada com OCCURRENCE_NOT_BOOKABLE", async () => {
      const ana = await createClient("ana");
      const cancelled = await createOccurrence(new Date(Date.now() + 3 * HOUR), {
        status: "CANCELLED",
      });
      const started = await createOccurrence(new Date(Date.now() - 10 * 60_000), {
        name: "Yoga",
      });

      const cancelledResponse = await reserve(ana.token, cancelled.id);
      const startedResponse = await reserve(ana.token, started.id);

      expect(cancelledResponse.status).toBe(409);
      expect(cancelledResponse.body.code).toBe("OCCURRENCE_NOT_BOOKABLE");
      expect(startedResponse.status).toBe(409);
      expect(startedResponse.body.code).toBe("OCCURRENCE_NOT_BOOKABLE");
      expect(await testPrisma.reservation.count()).toBe(0);
    });

    it("recusa cliente desativado", async () => {
      const ana = await createClient("ana", { status: "INACTIVE" });
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));

      const response = await reserve(ana.token, occurrence.id);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("USER_INACTIVE");
      expect(await testPrisma.reservation.count()).toBe(0);
    });

    it("devolve 404 para aula inexistente e 400 sem occurrenceId", async () => {
      const ana = await createClient("ana");

      const missing = await reserve(ana.token, "00000000-0000-0000-0000-000000000000");
      const invalid = await request(app.getHttpServer())
        .post("/api/reservations")
        .set("Authorization", `Bearer ${ana.token}`)
        .set("Idempotency-Key", randomUUID())
        .send({});

      expect(missing.status).toBe(404);
      expect(invalid.status).toBe(400);
    });

    it("exige login", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/reservations")
        .send({ occurrenceId: "x" });

      expect(response.status).toBe(401);
    });

    it("N clientes disputando a última vaga ao mesmo tempo: exatamente um consegue", async () => {
      const clients = await Promise.all(
        ["ana", "bruno", "carla", "davi", "elisa", "fabio"].map((name) => createClient(name)),
      );
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 1 });

      const responses = await Promise.all(
        clients.map((client) => reserve(client.token, occurrence.id)),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
      expect(
        responses.filter((response) => response.status === 409).map((r) => r.body.code),
      ).toEqual(Array(5).fill("CLASS_FULL"));
      expect(await testPrisma.reservation.count({ where: { occurrenceId: occurrence.id } })).toBe(
        1,
      );
    });
  });

  describe("solicitação repetida (idempotência)", () => {
    it("exige o header Idempotency-Key em formato UUID", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));

      const missing = await request(app.getHttpServer())
        .post("/api/reservations")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ occurrenceId: occurrence.id });
      const malformed = await reserve(ana.token, occurrence.id, "nao-e-uuid");

      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe("VALIDATION_ERROR");
      expect(malformed.status).toBe(400);
      expect(await testPrisma.reservation.count()).toBe(0);
    });

    it("mesma chave e mesmo corpo em sequência devolvem o resultado original", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const key = randomUUID();

      const first = await reserve(ana.token, occurrence.id, key);
      const second = await reserve(ana.token, occurrence.id, key);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("mesma chave em paralelo: uma única reserva e respostas idênticas", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const key = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => reserve(ana.token, occurrence.id, key)),
      );

      expect(responses.map((response) => response.status)).toEqual(Array(5).fill(201));
      for (const response of responses) expect(response.body).toEqual(responses[0].body);
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("memoriza a recusa: repetir a chave devolve o mesmo erro mesmo que a vaga apareça", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 1 });
      await reserve(ana.token, occurrence.id);
      const key = randomUUID();

      const refused = await reserve(bruno.token, occurrence.id, key);
      await testPrisma.classOccurrence.update({
        where: { id: occurrence.id },
        data: { capacity: 2 },
      });
      const repeated = await reserve(bruno.token, occurrence.id, key);
      const newIntent = await reserve(bruno.token, occurrence.id);

      expect(refused.status).toBe(409);
      expect(repeated.status).toBe(409);
      expect(repeated.body).toEqual(refused.body);
      expect(newIntent.status).toBe(201);
    });

    it("chave reutilizada com outro corpo é recusada com 422 IDEMPOTENCY_KEY_REUSED", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), { name: "Yoga" });
      const key = randomUUID();
      await reserve(ana.token, spinning.id, key);

      const response = await reserve(ana.token, yoga.id, key);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("a chave é por cliente: a mesma chave de outro cliente é outra intenção", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const key = randomUUID();

      const fromAna = await reserve(ana.token, occurrence.id, key);
      const fromBruno = await reserve(bruno.token, occurrence.id, key);

      expect(fromAna.status).toBe(201);
      expect(fromBruno.status).toBe(201);
      expect(fromBruno.body.id).not.toBe(fromAna.body.id);
    });
  });

  describe("conflito de horário do cliente", () => {
    // A agenda da academia é um espaço exclusivo: a constraint
    // class_occurrences_no_overlap impede duas aulas agendadas sobrepostas.
    // O motor de reserva não depende dessa regra da agenda; para exercitá-lo
    // com aulas simultâneas, a constraint sai do ar só neste bloco.
    beforeAll(async () => {
      await dropOccurrenceNoOverlapConstraint();
    });

    afterAll(async () => {
      await ensureOccurrenceNoOverlapConstraint();
    });

    it("recusa aula sobreposta a outra reserva minha com SCHEDULE_CONFLICT e a reserva conflitante", async () => {
      const ana = await createClient("ana");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const spinning = await createOccurrence(startsAt);
      const yoga = await createOccurrence(new Date(startsAt.getTime() + 30 * 60_000), {
        name: "Yoga",
      });
      const first = await reserve(ana.token, spinning.id);

      const response = await reserve(ana.token, yoga.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "SCHEDULE_CONFLICT",
        details: {
          reservation: { id: first.body.id, occurrence: { id: spinning.id, name: "Spinning" } },
        },
      });
      expect(response.body.message).toMatch(/Spinning às \d{2}h\d{2}/);
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("aula colada (termina quando a outra começa) não é conflito", async () => {
      const ana = await createClient("ana");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const spinning = await createOccurrence(startsAt);
      const yoga = await createOccurrence(new Date(startsAt.getTime() + HOUR), { name: "Yoga" });
      await reserve(ana.token, spinning.id);

      const response = await reserve(ana.token, yoga.id);

      expect(response.status).toBe(201);
    });

    it("a sobreposição com a reserva de outro cliente não é conflito", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const spinning = await createOccurrence(startsAt);
      const yoga = await createOccurrence(new Date(startsAt.getTime() + 30 * 60_000), {
        name: "Yoga",
      });
      await reserve(bruno.token, spinning.id);

      const response = await reserve(ana.token, yoga.id);

      expect(response.status).toBe(201);
    });

    it("reserva numa aula cancelada não conta como conflito", async () => {
      const ana = await createClient("ana");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const cancelled = await createOccurrence(startsAt);
      await reserve(ana.token, cancelled.id);
      await testPrisma.classOccurrence.update({
        where: { id: cancelled.id },
        data: { status: "CANCELLED" },
      });
      const replacement = await createOccurrence(startsAt, { name: "Yoga" });

      const response = await reserve(ana.token, replacement.id);

      expect(response.status).toBe(201);
    });

    it("remarcação ignora a reserva original no conflito, mas não as outras", async () => {
      const ana = await createClient("ana");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const spinning = await createOccurrence(startsAt);
      const yoga = await createOccurrence(new Date(startsAt.getTime() + 30 * MINUTE), {
        name: "Yoga",
      });
      const pilates = await createOccurrence(new Date(startsAt.getTime() + 3 * HOUR), {
        name: "Pilates",
      });
      const funcional = await createOccurrence(
        new Date(startsAt.getTime() + 3 * HOUR + 30 * MINUTE),
        { name: "Funcional" },
      );
      const original = await reserve(ana.token, spinning.id);
      await reserve(ana.token, pilates.id);

      const overlappingOriginal = await reschedule(ana.token, original.body.id, yoga.id);
      const overlappingOther = await reschedule(
        ana.token,
        overlappingOriginal.body.id,
        funcional.id,
      );

      expect(overlappingOriginal.status).toBe(201);
      expect(overlappingOther.status).toBe(409);
      expect(overlappingOther.body.code).toBe("SCHEDULE_CONFLICT");
      expect(await statusOf(overlappingOriginal.body.id)).toBe("CONFIRMED");
    });

    it("requisições simultâneas do mesmo cliente para aulas sobrepostas: no máximo uma reserva", async () => {
      const ana = await createClient("ana");
      const startsAt = new Date(Date.now() + 3 * HOUR);
      const occurrences = await Promise.all(
        ["Spinning", "Yoga", "Pilates", "Funcional"].map((name, index) =>
          createOccurrence(new Date(startsAt.getTime() + index * 10 * 60_000), { name }),
        ),
      );

      const responses = await Promise.all(
        occurrences.map((occurrence) => reserve(ana.token, occurrence.id)),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(
        responses.filter((response) => response.status === 409).map((r) => r.body.code),
      ).toEqual(Array(3).fill("SCHEDULE_CONFLICT"));
      expect(await testPrisma.reservation.count()).toBe(1);
    });
  });

  describe("cancelar reserva", () => {
    it("cancela até o início da aula e libera a vaga na hora", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 1 });
      const reservation = await reserve(ana.token, occurrence.id);

      const response = await cancel(ana.token, reservation.body.id);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: reservation.body.id,
        status: "CANCELLED",
        cancelledAt: expect.any(String),
      });
      const detail = await agendaItem(ana.token, occurrence.id);
      expect(detail.body).toMatchObject({ available: 1, myReservationId: null });
      expect((await reserve(bruno.token, occurrence.id)).status).toBe(201);
    });

    it("depois do início da aula recusa com CANCELLATION_WINDOW_CLOSED", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const reservation = await reserve(ana.token, occurrence.id);
      await testPrisma.classOccurrence.update({
        where: { id: occurrence.id },
        data: {
          startsAt: new Date(Date.now() - 5 * MINUTE),
          endsAt: new Date(Date.now() + 55 * MINUTE),
        },
      });

      const response = await cancel(ana.token, reservation.body.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CANCELLATION_WINDOW_CLOSED");
      const stored = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: reservation.body.id },
      });
      expect(stored.status).toBe("CONFIRMED");
    });

    it("reserva que não está confirmada recusa com RESERVATION_NOT_ACTIVE", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const reservation = await reserve(ana.token, occurrence.id);
      await cancel(ana.token, reservation.body.id);

      const response = await cancel(ana.token, reservation.body.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("RESERVATION_NOT_ACTIVE");
    });

    it("o cliente só cancela as próprias reservas", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const reservation = await reserve(ana.token, occurrence.id);

      const response = await cancel(bruno.token, reservation.body.id);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
      const stored = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: reservation.body.id },
      });
      expect(stored.status).toBe("CONFIRMED");
    });

    it("devolve 404 para reserva inexistente", async () => {
      const ana = await createClient("ana");

      const response = await cancel(ana.token, "00000000-0000-0000-0000-000000000000");

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    });
  });

  describe("remarcar reserva", () => {
    it("troca a reserva por outra aula numa única ação", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 5 });
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), {
        name: "Yoga",
        capacity: 5,
      });
      const original = await reserve(ana.token, spinning.id);

      const response = await reschedule(ana.token, original.body.id, yoga.id);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: "CONFIRMED", occurrence: { id: yoga.id } });
      expect(await statusOf(original.body.id)).toBe("CANCELLED");
      expect((await agendaItem(ana.token, spinning.id)).body).toMatchObject({
        available: 5,
        myReservationId: null,
      });
      expect((await agendaItem(ana.token, yoga.id)).body).toMatchObject({
        available: 4,
        myReservationId: response.body.id,
      });
    });

    it("aula nova cheia: devolve o mesmo CLASS_FULL da reserva comum e mantém a original", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), {
        name: "Yoga",
        capacity: 1,
      });
      const original = await reserve(ana.token, spinning.id);
      await reserve(bruno.token, yoga.id);

      const response = await reschedule(ana.token, original.body.id, yoga.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "CLASS_FULL",
        details: { currentAvailableSpots: 0 },
      });
      expect(await statusOf(original.body.id)).toBe("CONFIRMED");
      expect(await testPrisma.reservation.count({ where: { clientId: ana.user.id } })).toBe(1);
    });

    it("aula nova cancelada ou já iniciada: OCCURRENCE_NOT_BOOKABLE e a original continua", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const cancelled = await createOccurrence(new Date(Date.now() + 6 * HOUR), {
        name: "Yoga",
        status: "CANCELLED",
      });
      const original = await reserve(ana.token, spinning.id);

      const response = await reschedule(ana.token, original.body.id, cancelled.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("OCCURRENCE_NOT_BOOKABLE");
      expect(await statusOf(original.body.id)).toBe("CONFIRMED");
    });

    it("remarcar para a mesma aula é DUPLICATE_RESERVATION", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const original = await reserve(ana.token, spinning.id);

      const response = await reschedule(ana.token, original.body.id, spinning.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("DUPLICATE_RESERVATION");
      expect(await statusOf(original.body.id)).toBe("CONFIRMED");
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("a original precisa estar ativa, antes do início e ser do próprio cliente", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), { name: "Yoga" });
      const original = await reserve(ana.token, spinning.id);

      const fromOther = await reschedule(bruno.token, original.body.id, yoga.id);
      await testPrisma.classOccurrence.update({
        where: { id: spinning.id },
        data: {
          startsAt: new Date(Date.now() - 5 * MINUTE),
          endsAt: new Date(Date.now() + 55 * MINUTE),
        },
      });
      const afterStart = await reschedule(ana.token, original.body.id, yoga.id);
      await testPrisma.reservation.update({
        where: { id: original.body.id },
        data: { status: "CANCELLED" },
      });
      const notActive = await reschedule(ana.token, original.body.id, yoga.id);

      expect(fromOther.status).toBe(403);
      expect(fromOther.body.code).toBe("OUT_OF_SCOPE");
      expect(afterStart.body).toMatchObject({
        code: "CANCELLATION_WINDOW_CLOSED",
        message: "Não é mais possível remarcar: a aula já começou.",
      });
      expect(notActive.body.code).toBe("RESERVATION_NOT_ACTIVE");
      expect(await testPrisma.reservation.count({ where: { occurrenceId: yoga.id } })).toBe(0);
    });

    it("cliente desativado ou aula nova inexistente: recusa e a original continua", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), { name: "Yoga" });
      const original = await reserve(ana.token, spinning.id);

      const missing = await reschedule(
        ana.token,
        original.body.id,
        "00000000-0000-0000-0000-000000000000",
      );
      await testPrisma.user.update({ where: { id: ana.user.id }, data: { status: "INACTIVE" } });
      const inactive = await reschedule(ana.token, original.body.id, yoga.id);

      expect(missing.status).toBe(404);
      expect(inactive.status).toBe(403);
      expect(inactive.body.code).toBe("USER_INACTIVE");
      expect(await statusOf(original.body.id)).toBe("CONFIRMED");
    });

    it("recusa memorizada: repetir a chave devolve a mesma recusa, e outra aula com a mesma chave é 422", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), {
        name: "Yoga",
        capacity: 1,
      });
      const pilates = await createOccurrence(new Date(Date.now() + 9 * HOUR), { name: "Pilates" });
      const original = await reserve(ana.token, spinning.id);
      await reserve(bruno.token, yoga.id);
      const key = randomUUID();

      const refused = await reschedule(ana.token, original.body.id, yoga.id, key);
      await testPrisma.classOccurrence.update({ where: { id: yoga.id }, data: { capacity: 2 } });
      const repeated = await reschedule(ana.token, original.body.id, yoga.id, key);
      const otherIntent = await reschedule(ana.token, original.body.id, pilates.id, key);

      expect(refused.body.code).toBe("CLASS_FULL");
      expect(repeated.status).toBe(409);
      expect(repeated.body).toEqual(refused.body);
      expect(otherIntent.status).toBe(422);
      expect(otherIntent.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(await statusOf(original.body.id)).toBe("CONFIRMED");
    });

    it("é idempotente: a mesma chave devolve o resultado original sem remarcar de novo", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), { name: "Yoga" });
      const original = await reserve(ana.token, spinning.id);
      const key = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 3 }, () => reschedule(ana.token, original.body.id, yoga.id, key)),
      );
      const missingKey = await request(app.getHttpServer())
        .post(`/api/reservations/${original.body.id}/reschedule`)
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ occurrenceId: yoga.id });

      expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
      for (const response of responses) expect(response.body).toEqual(responses[0].body);
      expect(await testPrisma.reservation.count({ where: { occurrenceId: yoga.id } })).toBe(1);
      expect(missingKey.status).toBe(400);
    });

    it("a chave de uma reserva não serve para uma remarcação (outra intenção)", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), { name: "Yoga" });
      const key = randomUUID();
      const original = await reserve(ana.token, spinning.id, key);

      const response = await reschedule(ana.token, original.body.id, yoga.id, key);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(await statusOf(original.body.id)).toBe("CONFIRMED");
    });
  });

  describe("concorrência entre remarcações e reservas", () => {
    it("clientes remarcando ao mesmo tempo para a última vaga: só um consegue e os demais mantêm a original", async () => {
      const names = ["ana", "bruno", "carla", "davi"];
      const clients = await Promise.all(names.map((name) => createClient(name)));
      const origin = await createOccurrence(new Date(Date.now() + 3 * HOUR), { name: "Spinning" });
      const target = await createOccurrence(new Date(Date.now() + 6 * HOUR), {
        name: "Yoga",
        capacity: 1,
      });
      const originals = await Promise.all(
        clients.map((client) => reserve(client.token, origin.id)),
      );

      const responses = await Promise.all(
        clients.map((client, index) =>
          reschedule(client.token, originals[index].body.id, target.id),
        ),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409]);
      expect(
        responses.filter((response) => response.status === 409).map((r) => r.body.code),
      ).toEqual(Array(3).fill("CLASS_FULL"));
      const statuses = await Promise.all(originals.map((original) => statusOf(original.body.id)));
      expect(statuses.filter((status) => status === "CANCELLED")).toHaveLength(1);
      expect(statuses.filter((status) => status === "CONFIRMED")).toHaveLength(3);
      // Quem venceu é exatamente o cliente cuja original foi cancelada.
      const winner = responses.findIndex((response) => response.status === 201);
      expect(statuses[winner]).toBe("CANCELLED");
      expect(
        await testPrisma.reservation.count({
          where: { occurrenceId: target.id, status: "CONFIRMED" },
        }),
      ).toBe(1);
    });

    it("remarcações cruzadas ao mesmo tempo (A para a aula de B e B para a de A): repetidas várias vezes, todas terminam, sem impasse", async () => {
      // As duas requisições saem juntas (Promise.all), mas o entrelaçamento real é decidido pelo
      // servidor e pelo banco: por isso a corrida se repete. O resultado é o mesmo em qualquer
      // ordem (as duas aulas têm vaga de sobra), então a asserção é única. Um impasse (deadlock)
      // apareceria como erro 5xx em alguma rodada.
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const base = Date.now() + 3 * HOUR;
      const rounds = 8;

      for (let round = 0; round < rounds; round += 1) {
        // Rodadas espaçadas de 4h e aulas de 1h: nenhuma reserva sobrepõe outra do mesmo cliente.
        const spinning = await createOccurrence(new Date(base + round * 4 * HOUR), {
          name: "Spinning",
        });
        const yoga = await createOccurrence(new Date(base + (round * 4 + 2) * HOUR), {
          name: "Yoga",
        });
        const anaOriginal = await reserve(ana.token, spinning.id);
        const brunoOriginal = await reserve(bruno.token, yoga.id);
        expect([anaOriginal.status, brunoOriginal.status]).toEqual([201, 201]);

        const [anaMove, brunoMove] = await Promise.all([
          reschedule(ana.token, anaOriginal.body.id, yoga.id),
          reschedule(bruno.token, brunoOriginal.body.id, spinning.id),
        ]);

        expect([anaMove.status, brunoMove.status], `rodada ${round}`).toEqual([201, 201]);
        expect(await statusOf(anaOriginal.body.id)).toBe("CANCELLED");
        expect(await statusOf(brunoOriginal.body.id)).toBe("CANCELLED");
        expect(anaMove.body.occurrence.id).toBe(yoga.id);
        expect(brunoMove.body.occurrence.id).toBe(spinning.id);
      }

      expect(await testPrisma.reservation.count({ where: { status: "CONFIRMED" } })).toBe(
        2 * rounds,
      );
    });

    it("duas remarcações simultâneas da mesma reserva para aulas diferentes: só uma vale", async () => {
      const ana = await createClient("ana");
      const spinning = await createOccurrence(new Date(Date.now() + 3 * HOUR), {
        name: "Spinning",
      });
      const yoga = await createOccurrence(new Date(Date.now() + 6 * HOUR), { name: "Yoga" });
      const pilates = await createOccurrence(new Date(Date.now() + 9 * HOUR), { name: "Pilates" });
      const original = await reserve(ana.token, spinning.id);

      const responses = await Promise.all([
        reschedule(ana.token, original.body.id, yoga.id),
        reschedule(ana.token, original.body.id, pilates.id),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body.code).toBe(
        "RESERVATION_NOT_ACTIVE",
      );
      expect(await statusOf(original.body.id)).toBe("CANCELLED");
      expect(
        await testPrisma.reservation.count({
          where: { clientId: ana.user.id, status: "CONFIRMED" },
        }),
      ).toBe(1);
    });

    it("cancelar e remarcar a mesma reserva: em qualquer ordem, nunca sobra reserva ativa a mais", async () => {
      const ana = await createClient("ana");
      const base = Date.now() + 3 * HOUR;

      // Cada rodada usa um par novo de aulas (espaçadas de 4h, sem sobreposição).
      async function seedRound(round: number) {
        const spinning = await createOccurrence(new Date(base + round * 4 * HOUR), {
          name: "Spinning",
        });
        const yoga = await createOccurrence(new Date(base + (round * 4 + 2) * HOUR), {
          name: "Yoga",
        });
        const original = await reserve(ana.token, spinning.id);
        expect(original.status).toBe(201);
        return { yoga, originalId: original.body.id as string };
      }

      async function confirmedIn(occurrenceId: string) {
        const rows = await testPrisma.reservation.findMany({
          where: { clientId: ana.user.id, status: "CONFIRMED", occurrenceId },
        });
        return rows.map((row) => row.occurrenceId);
      }

      // Ordem 1, determinística: cancelou primeiro, a remarcação vê a original inativa.
      const first = await seedRound(0);
      const cancelFirst = await cancel(ana.token, first.originalId);
      const rescheduleAfterCancel = await reschedule(ana.token, first.originalId, first.yoga.id);
      expect(cancelFirst.status).toBe(200);
      expect(rescheduleAfterCancel.status).toBe(409);
      expect(rescheduleAfterCancel.body.code).toBe("RESERVATION_NOT_ACTIVE");
      expect(await confirmedIn(first.yoga.id)).toEqual([]);

      // Ordem 2, determinística: remarcou primeiro, o cancelamento encontra a original cancelada.
      const second = await seedRound(1);
      const moveFirst = await reschedule(ana.token, second.originalId, second.yoga.id);
      const cancelAfterMove = await cancel(ana.token, second.originalId);
      expect(moveFirst.status).toBe(201);
      expect(cancelAfterMove.status).toBe(409);
      expect(cancelAfterMove.body.code).toBe("RESERVATION_NOT_ACTIVE");
      expect(await confirmedIn(second.yoga.id)).toEqual([second.yoga.id]);

      // Corrida: as duas requisições saem juntas (Promise.all) e o servidor decide a ordem. Tabela
      // de desfechos válidos, conferida em cada rodada (o teste não controla qual acontece; as duas
      // ordens já foram provadas acima):
      //   cancelar/remarcar = 200/409 -> original cancelada, nada novo confirmado
      //   cancelar/remarcar = 409/201 -> original cancelada, exatamente uma reserva na aula nova
      // Qualquer outro par (por exemplo 200/201, que deixaria uma reserva ativa a mais) reprova.
      const validOutcomes: Record<
        string,
        { cancelCode: string | undefined; rescheduleCode: string | undefined; moved: boolean }
      > = {
        "200/409": {
          cancelCode: undefined,
          rescheduleCode: "RESERVATION_NOT_ACTIVE",
          moved: false,
        },
        "409/201": { cancelCode: "RESERVATION_NOT_ACTIVE", rescheduleCode: undefined, moved: true },
      };
      const rounds = 8;
      for (let round = 2; round < 2 + rounds; round += 1) {
        const { yoga, originalId } = await seedRound(round);

        const [cancelling, rescheduling] = await Promise.all([
          cancel(ana.token, originalId),
          reschedule(ana.token, originalId, yoga.id),
        ]);

        const key = `${cancelling.status}/${rescheduling.status}`;
        const expected = validOutcomes[key];
        expect(expected, `rodada ${round}: desfecho inválido ${key}`).toBeDefined();
        expect(cancelling.body.code).toBe(expected.cancelCode);
        expect(rescheduling.body.code).toBe(expected.rescheduleCode);
        expect(await statusOf(originalId)).toBe("CANCELLED");
        expect(await confirmedIn(yoga.id)).toEqual(expected.moved ? [yoga.id] : []);
      }
    });

    it("o mesmo cliente reservando a mesma aula várias vezes ao mesmo tempo (chaves diferentes): uma reserva, o resto é duplicidade", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR));

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => reserve(ana.token, occurrence.id)),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409, 409, 409, 409,
      ]);
      expect(
        responses.filter((response) => response.status === 409).map((r) => r.body.code),
      ).toEqual(Array(4).fill("DUPLICATE_RESERVATION"));
      expect(await testPrisma.reservation.count({ where: { occurrenceId: occurrence.id } })).toBe(
        1,
      );
    });

    it("cancelar libera a vaga na hora: quem foi recusado por lotação consegue depois, e a vaga liberada vai para exatamente um dos que disputam", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const carla = await createClient("carla");
      const occurrence = await createOccurrence(new Date(Date.now() + 3 * HOUR), { capacity: 1 });
      const anaReservation = await reserve(ana.token, occurrence.id);
      expect(anaReservation.status).toBe(201);

      // Com a aula cheia, os dois são recusados: sem cancelamento não há vaga para ninguém.
      const fullForBruno = await reserve(bruno.token, occurrence.id);
      const fullForCarla = await reserve(carla.token, occurrence.id);
      expect([fullForBruno.status, fullForCarla.status]).toEqual([409, 409]);
      expect([fullForBruno.body.code, fullForCarla.body.code]).toEqual([
        "CLASS_FULL",
        "CLASS_FULL",
      ]);

      // O cancelamento termina antes da disputa: a vaga liberada já aparece na agenda...
      const cancelled = await cancel(ana.token, anaReservation.body.id);
      expect(cancelled.status).toBe(200);
      expect((await agendaItem(bruno.token, occurrence.id)).body.available).toBe(1);

      // ...e os dois candidatos disputam essa vaga ao mesmo tempo: exatamente um vence.
      const [brunoTry, carlaTry] = await Promise.all([
        reserve(bruno.token, occurrence.id),
        reserve(carla.token, occurrence.id),
      ]);

      expect([brunoTry.status, carlaTry.status].sort()).toEqual([201, 409]);
      const loser = brunoTry.status === 409 ? brunoTry : carlaTry;
      expect(loser.body.code).toBe("CLASS_FULL");
      expect(
        await testPrisma.reservation.count({
          where: { occurrenceId: occurrence.id, status: "CONFIRMED" },
        }),
      ).toBe(1);
    });

    it("cancelamento disparado junto com tentativas de reserva: nunca passa da capacidade e a vaga nunca se perde", async () => {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const carla = await createClient("carla");
      const davi = await createClient("davi");
      const base = Date.now() + 3 * HOUR;
      const rounds = 8;

      // Corrida: o cancelamento da Ana e as tentativas de Bruno e Carla saem juntos (Promise.all);
      // o servidor decide a ordem, e o teste não controla qual acontece. Tabela de desfechos
      // válidos (Bruno/Carla) em aula de 1 vaga, com o cancelamento sempre 200:
      //   201/409 e 409/201 -> o candidato que entrou depois da liberação leva a vaga
      //   409/409           -> os dois tentaram antes da liberação; a vaga fica livre
      // 201/201 (capacidade excedida) e qualquer recusa diferente de CLASS_FULL reprovam.
      // Prova da liberação em todos os casos: depois da corrida, Davi tenta a mesma aula e só é
      // recusado (CLASS_FULL) se alguém já tinha levado a vaga; senão a vaga livre tem que ser dele.
      const validOutcomes = new Set(["201/409", "409/201", "409/409"]);
      for (let round = 0; round < rounds; round += 1) {
        const occurrence = await createOccurrence(new Date(base + round * 2 * HOUR), {
          capacity: 1,
        });
        const anaReservation = await reserve(ana.token, occurrence.id);
        expect(anaReservation.status).toBe(201);

        const [cancelled, brunoTry, carlaTry] = await Promise.all([
          cancel(ana.token, anaReservation.body.id),
          reserve(bruno.token, occurrence.id),
          reserve(carla.token, occurrence.id),
        ]);

        const outcome = `${brunoTry.status}/${carlaTry.status}`;
        expect(cancelled.status, `rodada ${round}`).toBe(200);
        expect(validOutcomes.has(outcome), `rodada ${round}: desfecho inválido ${outcome}`).toBe(
          true,
        );
        for (const attempt of [brunoTry, carlaTry]) {
          if (attempt.status === 409) expect(attempt.body.code).toBe("CLASS_FULL");
        }
        const taken = [brunoTry, carlaTry].filter((attempt) => attempt.status === 201).length;
        expect(
          await testPrisma.reservation.count({
            where: { occurrenceId: occurrence.id, status: "CONFIRMED" },
          }),
        ).toBe(taken);

        const followUp = await reserve(davi.token, occurrence.id);
        if (taken === 1) {
          expect(followUp.status).toBe(409);
          expect(followUp.body.code).toBe("CLASS_FULL");
        } else {
          expect(followUp.status).toBe(201);
        }
      }
    });
  });

  describe("minhas reservas", () => {
    async function seedHistory() {
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const tomorrow = await createOccurrence(new Date(Date.now() + 24 * HOUR), { name: "Yoga" });
      const soon = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const later = await createOccurrence(new Date(Date.now() + 48 * HOUR), { name: "Pilates" });
      const confirmedSoon = await reserve(ana.token, soon.id);
      const confirmedTomorrow = await reserve(ana.token, tomorrow.id);
      const cancelled = await reserve(ana.token, later.id);
      await cancel(ana.token, cancelled.body.id);
      await reserve(bruno.token, soon.id);

      // Aulas passadas: reservas concluída e não compareceu (a presença chega
      // na Fase 4; aqui o estado é gravado direto).
      const lastWeek = await createOccurrence(new Date(Date.now() - 7 * 24 * HOUR), {
        name: "Funcional",
      });
      const yesterday = await createOccurrence(new Date(Date.now() - 24 * HOUR), {
        name: "Muay Thai",
      });
      const completed = await testPrisma.reservation.create({
        data: { clientId: ana.user.id, occurrenceId: lastWeek.id, status: "COMPLETED" },
      });
      const noShow = await testPrisma.reservation.create({
        data: { clientId: ana.user.id, occurrenceId: yesterday.id, status: "NO_SHOW" },
      });
      return { ana, confirmedSoon, confirmedTomorrow, cancelled, completed, noShow };
    }

    it("lista as futuras em ordem cronológica, só do próprio cliente", async () => {
      const { ana, confirmedSoon, confirmedTomorrow, cancelled } = await seedHistory();

      const response = await listMine(ana.token);

      expect(response.status).toBe(200);
      expect(response.body.map((r: { id: string }) => r.id)).toEqual([
        confirmedSoon.body.id,
        confirmedTomorrow.body.id,
        cancelled.body.id,
      ]);
    });

    it("lista as passadas da mais recente para a mais antiga", async () => {
      const { ana, completed, noShow } = await seedHistory();

      const response = await listMine(ana.token, "?when=past");

      expect(response.body.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([
        [noShow.id, "NO_SHOW"],
        [completed.id, "COMPLETED"],
      ]);
    });

    it("aula em andamento continua entre as futuras", async () => {
      const ana = await createClient("ana");
      const running = await createOccurrence(new Date(Date.now() + 3 * HOUR));
      const reservation = await reserve(ana.token, running.id);
      await testPrisma.classOccurrence.update({
        where: { id: running.id },
        data: {
          startsAt: new Date(Date.now() - 10 * MINUTE),
          endsAt: new Date(Date.now() + 50 * MINUTE),
        },
      });

      const upcoming = await listMine(ana.token);
      const past = await listMine(ana.token, "?when=past");

      expect(upcoming.body.map((r: { id: string }) => r.id)).toEqual([reservation.body.id]);
      expect(past.body).toEqual([]);
    });

    it("filtra por estado", async () => {
      const { ana, cancelled, noShow } = await seedHistory();

      const cancelledOnly = await listMine(ana.token, "?when=upcoming&status=CANCELLED");
      const noShowOnly = await listMine(ana.token, "?when=past&status=NO_SHOW");
      const invalid = await listMine(ana.token, "?status=QUALQUER");

      expect(cancelledOnly.body).toEqual([
        expect.objectContaining({ id: cancelled.body.id, status: "CANCELLED" }),
      ]);
      expect(noShowOnly.body).toEqual([expect.objectContaining({ id: noShow.id })]);
      expect(invalid.status).toBe(400);
    });

    it("não mostra reservas de outros clientes", async () => {
      await seedHistory();
      const carla = await createClient("carla");

      const upcoming = await listMine(carla.token);
      const past = await listMine(carla.token, "?when=past");

      expect(upcoming.body).toEqual([]);
      expect(past.body).toEqual([]);
    });
  });

  describe("proteção da agenda administrativa", () => {
    async function loginAsAdmin() {
      const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
      const admin = await createUser({
        email: "admin@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
        fullName: "Administração",
      });
      return loginAndGetAccessToken(app, admin.email, PASSWORD);
    }

    function admin(token: string) {
      const server = app.getHttpServer();
      return {
        cancel: (id: string) =>
          request(server)
            .post(`/api/occurrences/${id}/cancel`)
            .set("Authorization", `Bearer ${token}`),
        remove: (id: string) =>
          request(server).delete(`/api/occurrences/${id}`).set("Authorization", `Bearer ${token}`),
        update: (id: string, body: object) =>
          request(server)
            .patch(`/api/occurrences/${id}`)
            .set("Authorization", `Bearer ${token}`)
            .send(body),
        list: (from: string, to: string) =>
          request(server)
            .get(`/api/occurrences?from=${from}&to=${to}`)
            .set("Authorization", `Bearer ${token}`),
      };
    }

    async function occurrenceWithReservations(confirmed: number, cancelled = 0) {
      const occurrence = await createOccurrence(new Date(Date.now() + 24 * HOUR), {
        capacity: 10,
      });
      for (let index = 0; index < confirmed + cancelled; index += 1) {
        const client = await createClient(`cliente${index}`);
        const reservation = await reserve(client.token, occurrence.id);
        if (index >= confirmed) await cancel(client.token, reservation.body.id);
      }
      return occurrence;
    }

    it("a grade administrativa informa as reservas confirmadas de cada aula", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(3, 1);
      // Um dia de folga para cada lado: a listagem usa datas locais da academia.
      const isoDay = (offset: number) =>
        new Date(occurrence.startsAt.getTime() + offset * 24 * HOUR).toISOString().slice(0, 10);

      const response = await admin(token).list(isoDay(-1), isoDay(1));

      expect(response.body).toEqual([
        expect.objectContaining({ id: occurrence.id, bookedCount: 3, capacity: 10 }),
      ]);
    });

    it("cancelar aula com reservas confirmadas → OCCURRENCE_HAS_RESERVATIONS", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(2);

      const response = await admin(token).cancel(occurrence.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "OCCURRENCE_HAS_RESERVATIONS",
        details: { confirmedReservations: 2 },
      });
      const stored = await testPrisma.classOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });
      expect(stored.status).toBe("SCHEDULED");
    });

    it("aula só com reservas canceladas pode ser excluída, e elas saem junto", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(0, 1);

      const removed = await admin(token).remove(occurrence.id);

      expect(removed.status).toBe(204);
      expect(await testPrisma.classOccurrence.count({ where: { id: occurrence.id } })).toBe(0);
      expect(await testPrisma.reservation.count({ where: { occurrenceId: occurrence.id } })).toBe(
        0,
      );
    });

    it("aula com presença registrada não pode ser excluída", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(1);
      await testPrisma.reservation.updateMany({
        where: { occurrenceId: occurrence.id },
        data: { status: "COMPLETED" },
      });

      const removed = await admin(token).remove(occurrence.id);

      expect(removed.status).toBe(409);
      expect(removed.body).toMatchObject({
        code: "OCCURRENCE_HAS_RESERVATIONS",
        details: { confirmedReservations: 0 },
      });
    });

    it("excluir aula com reservas confirmadas → OCCURRENCE_HAS_RESERVATIONS", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(1);

      const response = await admin(token).remove(occurrence.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "OCCURRENCE_HAS_RESERVATIONS",
        details: { confirmedReservations: 1 },
      });
      expect(await testPrisma.classOccurrence.count({ where: { id: occurrence.id } })).toBe(1);
    });

    it("capacidade abaixo das reservas confirmadas → CHANGE_INVALIDATES_RESERVATIONS", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(3);

      const below = await admin(token).update(occurrence.id, { capacity: 2 });
      const equal = await admin(token).update(occurrence.id, { capacity: 3 });

      expect(below.status).toBe(409);
      expect(below.body).toMatchObject({
        code: "CHANGE_INVALIDATES_RESERVATIONS",
        details: { confirmedReservations: 3 },
      });
      expect(equal.status).toBe(200);
      expect(equal.body.capacity).toBe(3);
    });

    it("mudar horário ou duração de aula com reservas → CHANGE_INVALIDATES_RESERVATIONS", async () => {
      const token = await loginAsAdmin();
      const occurrence = await occurrenceWithReservations(1);
      const staff = await createUser({
        email: "rafael@fitburn.local",
        password: PASSWORD,
        profileId: (await createAccessProfile({ name: "Professor" })).id,
        fullName: "Rafael Andrade",
      });

      const moved = await admin(token).update(occurrence.id, { startTime: "23:30" });
      const longer = await admin(token).update(occurrence.id, { durationMinutes: 90 });
      const substitute = await admin(token).update(occurrence.id, { instructorId: staff.id });

      expect(moved.status).toBe(409);
      expect(moved.body.code).toBe("CHANGE_INVALIDATES_RESERVATIONS");
      expect(longer.status).toBe(409);
      expect(longer.body.code).toBe("CHANGE_INVALIDATES_RESERVATIONS");
      expect(substitute.status).toBe(200);
      expect(substitute.body.instructor).toMatchObject({ id: staff.id });
      // Trocar só o professor não mexe no horário (nem na precisão gravada).
      expect(substitute.body.startsAt).toBe(occurrence.startsAt.toISOString());
    });

    it("cancelamento da aula e reserva simultâneos: nunca fica reserva confirmada em aula cancelada", async () => {
      const token = await loginAsAdmin();
      const client = await createClient("ana");
      const occurrence = await createOccurrence(new Date(Date.now() + 24 * HOUR));

      const [booking, cancelling] = await Promise.all([
        reserve(client.token, occurrence.id),
        admin(token).cancel(occurrence.id),
      ]);

      const stored = await testPrisma.classOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });
      const confirmed = await testPrisma.reservation.count({
        where: { occurrenceId: occurrence.id, status: "CONFIRMED" },
      });
      if (stored.status === "CANCELLED") {
        expect(cancelling.status).toBe(201);
        expect(booking.body.code).toBe("OCCURRENCE_NOT_BOOKABLE");
        expect(confirmed).toBe(0);
      } else {
        expect(booking.status).toBe(201);
        expect(cancelling.body.code).toBe("OCCURRENCE_HAS_RESERVATIONS");
        expect(confirmed).toBe(1);
      }
    });
  });
});
