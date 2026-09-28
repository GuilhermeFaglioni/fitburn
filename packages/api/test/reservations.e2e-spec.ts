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
});
