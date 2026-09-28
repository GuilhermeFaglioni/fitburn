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
});
