import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  cleanDatabase,
  dropOccurrenceNoOverlapConstraint,
  ensureOccurrenceNoOverlapConstraint,
  testPrisma,
} from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("Reservas administrativas (HTTP)", () => {
  let app: INestApplication;
  let clientProfileId: string;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    await dropOccurrenceNoOverlapConstraint();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await ensureOccurrenceNoOverlapConstraint();
  });

  beforeEach(async () => {
    await cleanDatabase();
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const admin = await createUser({
      email: "admin@fitburn.local",
      password: PASSWORD,
      profileId: adminProfile.id,
      fullName: "Alice Admin",
    });
    adminId = admin.id;
    adminToken = await loginAndGetAccessToken(app, admin.email, PASSWORD);
  });

  async function createClient(name: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId: clientProfileId,
      fullName: name,
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    if (status === "INACTIVE") {
      await testPrisma.user.update({ where: { id: user.id }, data: { status } });
    }
    return { user, token };
  }

  async function createStaff(
    name: string,
    access: {
      actions: Array<"VIEW" | "CREATE" | "EDIT" | "DELETE">;
      scope: "ALL" | "ASSIGNED_CLIENTS";
    },
  ) {
    const profile = await createAccessProfile({ name: `Perfil ${name}` });
    await grantModuleAccess({
      profileId: profile.id,
      module: "RESERVAS",
      actions: access.actions,
      scope: access.scope,
    });
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId: profile.id,
      fullName: name,
    });
    return { user, token: await loginAndGetAccessToken(app, user.email, PASSWORD) };
  }

  async function createOccurrence(
    startsAt: Date,
    overrides: {
      status?: "SCHEDULED" | "CANCELLED";
      capacity?: number;
      name?: string;
      instructorId?: string;
    } = {},
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
        instructorId: overrides.instructorId ?? null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR),
      },
    });
  }

  function reserveFor(
    token: string,
    clientId: string,
    occurrenceId: string,
    key: string = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post("/api/admin/reservations")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ clientId, occurrenceId });
  }

  function cancelFor(token: string, reservationId: string) {
    return request(app.getHttpServer())
      .post(`/api/admin/reservations/${reservationId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
  }

  function rescheduleFor(
    token: string,
    reservationId: string,
    occurrenceId: string,
    key: string = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post(`/api/admin/reservations/${reservationId}/reschedule`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ occurrenceId });
  }

  function list(token: string, query = "") {
    return request(app.getHttpServer())
      .get(`/api/admin/reservations${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  function preview(token: string, query: string) {
    return request(app.getHttpServer())
      .get(`/api/admin/reservations/preview?${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  const inFuture = (hours: number) => new Date(Date.now() + hours * HOUR);

  describe("criar em nome do cliente", () => {
    it("confirma a reserva do cliente e registra a equipe como autora", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));

      const response = await reserveFor(adminToken, ana.user.id, occurrence.id);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: "CONFIRMED",
        client: { id: ana.user.id, fullName: "ana" },
        occurrence: { id: occurrence.id, name: "Spinning" },
        createdBy: { id: adminId, fullName: "Alice Admin", kind: "STAFF" },
        cancelledBy: null,
      });
      const stored = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(stored.clientId).toBe(ana.user.id);
      expect(stored.createdById).toBe(adminId);
    });

    it("a reserva feita pelo próprio cliente registra o cliente como autor", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));

      const response = await request(app.getHttpServer())
        .post("/api/reservations")
        .set("Authorization", `Bearer ${ana.token}`)
        .set("Idempotency-Key", randomUUID())
        .send({ occurrenceId: occurrence.id });
      expect(response.status).toBe(201);

      const listed = await list(adminToken, `?clientId=${ana.user.id}`);
      expect(listed.body[0]).toMatchObject({
        id: response.body.id,
        createdBy: { id: ana.user.id, kind: "CLIENT" },
      });
    });

    it("recusa aula lotada com CLASS_FULL e as vagas atuais", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const occurrence = await createOccurrence(inFuture(3), { capacity: 1 });
      await reserveFor(adminToken, bia.user.id, occurrence.id);

      const response = await reserveFor(adminToken, ana.user.id, occurrence.id);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "CLASS_FULL",
        details: { currentAvailableSpots: 0 },
      });
    });

    it("recusa cliente já inscrito com DUPLICATE_RESERVATION", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      await reserveFor(adminToken, ana.user.id, occurrence.id);

      const response = await reserveFor(adminToken, ana.user.id, occurrence.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("DUPLICATE_RESERVATION");
    });

    it("recusa aula sobreposta com SCHEDULE_CONFLICT e a reserva conflitante", async () => {
      const ana = await createClient("ana");
      const startsAt = inFuture(3);
      const spinning = await createOccurrence(startsAt);
      const yoga = await createOccurrence(new Date(startsAt.getTime() + 30 * MINUTE), {
        name: "Yoga",
      });
      const first = await reserveFor(adminToken, ana.user.id, spinning.id);

      const response = await reserveFor(adminToken, ana.user.id, yoga.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("SCHEDULE_CONFLICT");
      expect(response.body.details.reservation.id).toBe(first.body.id);
    });

    it("recusa aula cancelada ou já iniciada com OCCURRENCE_NOT_BOOKABLE", async () => {
      const ana = await createClient("ana");
      const cancelled = await createOccurrence(inFuture(3), { status: "CANCELLED" });
      const started = await createOccurrence(new Date(Date.now() - 10 * MINUTE), {
        name: "Yoga",
      });

      for (const occurrence of [cancelled, started]) {
        const response = await reserveFor(adminToken, ana.user.id, occurrence.id);
        expect(response.status).toBe(409);
        expect(response.body.code).toBe("OCCURRENCE_NOT_BOOKABLE");
      }
    });

    it("recusa cliente desativado com USER_INACTIVE", async () => {
      const ana = await createClient("ana", "INACTIVE");
      const occurrence = await createOccurrence(inFuture(3));

      const response = await reserveFor(adminToken, ana.user.id, occurrence.id);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("USER_INACTIVE");
    });

    it("recusa cliente excluído com USER_ALREADY_DELETED, na criação, na remarcação e na prévia", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const other = await createOccurrence(inFuture(6), { name: "Yoga" });
      const reserved = await reserveFor(adminToken, ana.user.id, occurrence.id);
      await testPrisma.user.update({ where: { id: ana.user.id }, data: { status: "DELETED" } });

      const created = await reserveFor(adminToken, ana.user.id, other.id);
      const rescheduled = await rescheduleFor(adminToken, reserved.body.id, other.id);
      const previewed = await preview(
        adminToken,
        `clientId=${ana.user.id}&occurrenceId=${other.id}`,
      );

      for (const response of [created, rescheduled]) {
        expect(response.status).toBe(409);
        expect(response.body.code).toBe("USER_ALREADY_DELETED");
        expect(response.body.message).not.toMatch(/reative|inativo/i);
      }
      expect(previewed.body).toMatchObject({
        canBook: false,
        reason: { code: "USER_ALREADY_DELETED" },
      });
    });

    it("devolve 404 para aula ou cliente inexistente (ou que não é cliente) e 400 sem os campos", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));

      const noOccurrence = await reserveFor(adminToken, ana.user.id, "nao-existe");
      expect(noOccurrence.status).toBe(404);
      expect(noOccurrence.body.code).toBe("NOT_FOUND");

      const noClient = await reserveFor(adminToken, "nao-existe", occurrence.id);
      expect(noClient.status).toBe(404);

      const notAClient = await reserveFor(adminToken, adminId, occurrence.id);
      expect(notAClient.status).toBe(404);

      const invalid = await request(app.getHttpServer())
        .post("/api/admin/reservations")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("Idempotency-Key", randomUUID())
        .send({ occurrenceId: occurrence.id });
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe("VALIDATION_ERROR");
    });

    it("exige o header Idempotency-Key em formato UUID", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const body = { clientId: ana.user.id, occurrenceId: occurrence.id };

      const missing = await request(app.getHttpServer())
        .post("/api/admin/reservations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body);
      expect(missing.status).toBe(400);

      const malformed = await request(app.getHttpServer())
        .post("/api/admin/reservations")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("Idempotency-Key", "abc")
        .send(body);
      expect(malformed.status).toBe(400);
    });

    it("a mesma solicitação repetida não cria reserva duplicada", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const key = randomUUID();

      const first = await reserveFor(adminToken, ana.user.id, occurrence.id, key);
      const second = await reserveFor(adminToken, ana.user.id, occurrence.id, key);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("solicitações repetidas em paralelo criam uma única reserva", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const key = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 4 }, () => reserveFor(adminToken, ana.user.id, occurrence.id, key)),
      );

      expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
      expect(await testPrisma.reservation.count()).toBe(1);
    });

    it("repetir a chave devolve a mesma recusa e outra intenção com a chave é 422", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const full = await createOccurrence(inFuture(3), { capacity: 1 });
      const other = await createOccurrence(inFuture(6), { name: "Yoga" });
      await reserveFor(adminToken, bia.user.id, full.id);
      const key = randomUUID();

      const first = await reserveFor(adminToken, ana.user.id, full.id, key);
      const replay = await reserveFor(adminToken, ana.user.id, full.id, key);
      const reused = await reserveFor(adminToken, ana.user.id, other.id, key);

      expect(first.body.code).toBe("CLASS_FULL");
      expect(replay.status).toBe(409);
      expect(replay.body).toEqual(first.body);
      expect(reused.status).toBe(422);
      expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });
  });

  describe("cancelar em nome do cliente", () => {
    it("cancela, libera a vaga e registra a equipe como quem cancelou", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3), { capacity: 1 });
      const created = await reserveFor(adminToken, ana.user.id, occurrence.id);

      const response = await cancelFor(adminToken, created.body.id);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.body.id,
        status: "CANCELLED",
        createdBy: { id: adminId, kind: "STAFF" },
        cancelledBy: { id: adminId, fullName: "Alice Admin", kind: "STAFF" },
      });
      expect(response.body.cancelledAt).not.toBeNull();
      const bia = await createClient("bia");
      expect((await reserveFor(adminToken, bia.user.id, occurrence.id)).status).toBe(201);
    });

    it("o cancelamento feito pelo próprio cliente registra o cliente", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const created = await reserveFor(adminToken, ana.user.id, occurrence.id);

      const response = await request(app.getHttpServer())
        .post(`/api/reservations/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${ana.token}`);
      expect(response.status).toBe(200);

      const listed = await list(adminToken, `?clientId=${ana.user.id}&status=CANCELLED`);
      expect(listed.body[0]).toMatchObject({
        createdBy: { id: adminId, kind: "STAFF" },
        cancelledBy: { id: ana.user.id, kind: "CLIENT" },
      });
    });

    it("recusa com os mesmos erros: já cancelada, aula iniciada e reserva inexistente", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const created = await reserveFor(adminToken, ana.user.id, occurrence.id);
      await cancelFor(adminToken, created.body.id);

      const again = await cancelFor(adminToken, created.body.id);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("RESERVATION_NOT_ACTIVE");

      const started = await createOccurrence(new Date(Date.now() - 10 * MINUTE), {
        name: "Yoga",
      });
      const late = await testPrisma.reservation.create({
        data: { clientId: ana.user.id, occurrenceId: started.id },
      });
      const closed = await cancelFor(adminToken, late.id);
      expect(closed.status).toBe(409);
      expect(closed.body.code).toBe("CANCELLATION_WINDOW_CLOSED");
      expect(
        (await testPrisma.reservation.findUniqueOrThrow({ where: { id: late.id } })).status,
      ).toBe("CONFIRMED");

      const missing = await cancelFor(adminToken, "nao-existe");
      expect(missing.status).toBe(404);
    });
  });

  describe("remarcar em nome do cliente", () => {
    it("troca a reserva por outra aula, com a equipe como autora da nova e de quem cancelou a original", async () => {
      const ana = await createClient("ana");
      const from = await createOccurrence(inFuture(3));
      const to = await createOccurrence(inFuture(6), { name: "Yoga" });
      const original = await reserveFor(adminToken, ana.user.id, from.id);
      const teacher = await createStaff("paula", { actions: ["VIEW", "EDIT"], scope: "ALL" });

      const response = await rescheduleFor(teacher.token, original.body.id, to.id);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: "CONFIRMED",
        occurrence: { id: to.id },
        client: { id: ana.user.id },
        createdBy: { id: teacher.user.id, kind: "STAFF" },
      });
      const previous = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: original.body.id },
      });
      expect(previous.status).toBe("CANCELLED");
      expect(previous.cancelledById).toBe(teacher.user.id);
    });

    it("recusa aula nova lotada com CLASS_FULL e mantém a original", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const from = await createOccurrence(inFuture(3));
      const full = await createOccurrence(inFuture(6), { name: "Yoga", capacity: 1 });
      await reserveFor(adminToken, bia.user.id, full.id);
      const original = await reserveFor(adminToken, ana.user.id, from.id);

      const response = await rescheduleFor(adminToken, original.body.id, full.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CLASS_FULL");
      const stored = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: original.body.id },
      });
      expect(stored.status).toBe("CONFIRMED");
      expect(stored.cancelledById).toBeNull();
    });

    it("remarcar para a mesma aula é DUPLICATE_RESERVATION e original inativa é RESERVATION_NOT_ACTIVE", async () => {
      const ana = await createClient("ana");
      const from = await createOccurrence(inFuture(3));
      const to = await createOccurrence(inFuture(6), { name: "Yoga" });
      const original = await reserveFor(adminToken, ana.user.id, from.id);

      const same = await rescheduleFor(adminToken, original.body.id, from.id);
      expect(same.status).toBe(409);
      expect(same.body.code).toBe("DUPLICATE_RESERVATION");

      await cancelFor(adminToken, original.body.id);
      const inactive = await rescheduleFor(adminToken, original.body.id, to.id);
      expect(inactive.status).toBe(409);
      expect(inactive.body.code).toBe("RESERVATION_NOT_ACTIVE");
    });

    it("é idempotente: a mesma chave devolve o resultado original", async () => {
      const ana = await createClient("ana");
      const from = await createOccurrence(inFuture(3));
      const to = await createOccurrence(inFuture(6), { name: "Yoga" });
      const original = await reserveFor(adminToken, ana.user.id, from.id);
      const key = randomUUID();

      const first = await rescheduleFor(adminToken, original.body.id, to.id, key);
      const second = await rescheduleFor(adminToken, original.body.id, to.id, key);

      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(
        await testPrisma.reservation.count({ where: { status: "CONFIRMED", occurrenceId: to.id } }),
      ).toBe(1);
    });

    it("devolve 404 para reserva inexistente", async () => {
      const to = await createOccurrence(inFuture(6));
      const response = await rescheduleFor(adminToken, "nao-existe", to.id);
      expect(response.status).toBe(404);
    });
  });

  describe("consulta", () => {
    async function scenario() {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const spinning = await createOccurrence(inFuture(3), { name: "Spinning" });
      const yoga = await createOccurrence(inFuture(72), { name: "Yoga" });
      const past = await createOccurrence(inFuture(-48), { name: "Boxe" });
      const anaSpinning = await reserveFor(adminToken, ana.user.id, spinning.id);
      const biaSpinning = await reserveFor(adminToken, bia.user.id, spinning.id);
      const anaYoga = await reserveFor(adminToken, ana.user.id, yoga.id);
      await cancelFor(adminToken, anaYoga.body.id);
      const biaPast = await testPrisma.reservation.create({
        data: {
          clientId: bia.user.id,
          occurrenceId: past.id,
          status: "COMPLETED",
          createdById: bia.user.id,
        },
      });
      return { ana, bia, spinning, yoga, past, anaSpinning, biaSpinning, anaYoga, biaPast };
    }

    const ids = (body: Array<{ id: string }>) => body.map((item) => item.id).sort();

    it("lista tudo com cliente, aula e atores, da aula mais recente para a mais antiga", async () => {
      const s = await scenario();

      const response = await list(adminToken);

      expect(response.status).toBe(200);
      expect(response.body.map((item: { id: string }) => item.id)).toEqual([
        s.anaYoga.body.id,
        // mesma aula: a mais antiga primeiro
        s.anaSpinning.body.id,
        s.biaSpinning.body.id,
        s.biaPast.id,
      ]);
      expect(response.body[1]).toMatchObject({
        client: {
          id: s.ana.user.id,
          fullName: "ana",
          email: "ana@fitburn.local",
          status: "ACTIVE",
        },
        occurrence: { name: "Spinning" },
        createdBy: { id: adminId, kind: "STAFF" },
      });
    });

    it("filtra por cliente, ocorrência e estado", async () => {
      const s = await scenario();

      const byClient = await list(adminToken, `?clientId=${s.bia.user.id}`);
      expect(ids(byClient.body)).toEqual([s.biaSpinning.body.id, s.biaPast.id].sort());

      const byOccurrence = await list(adminToken, `?occurrenceId=${s.spinning.id}`);
      expect(ids(byOccurrence.body)).toEqual([s.anaSpinning.body.id, s.biaSpinning.body.id].sort());

      const byStatus = await list(adminToken, "?status=CANCELLED");
      expect(ids(byStatus.body)).toEqual([s.anaYoga.body.id]);

      const combined = await list(
        adminToken,
        `?clientId=${s.ana.user.id}&occurrenceId=${s.spinning.id}&status=CONFIRMED`,
      );
      expect(ids(combined.body)).toEqual([s.anaSpinning.body.id]);
    });

    it("filtra por período (datas da academia, inclusivas) pelo horário da aula", async () => {
      const s = await scenario();
      const dayOf = (date: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);

      const spinningDay = dayOf(s.spinning.startsAt);
      const onlySpinning = await list(adminToken, `?from=${spinningDay}&to=${spinningDay}`);
      expect(ids(onlySpinning.body)).toEqual([s.anaSpinning.body.id, s.biaSpinning.body.id].sort());

      const untilYesterday = await list(adminToken, `?to=${dayOf(inFuture(-24))}`);
      expect(ids(untilYesterday.body)).toEqual([s.biaPast.id]);

      const fromYogaDay = await list(adminToken, `?from=${dayOf(s.yoga.startsAt)}`);
      expect(ids(fromYogaDay.body)).toEqual([s.anaYoga.body.id]);
    });

    it("valida filtros: data inválida, período invertido e cliente ou aula inexistente", async () => {
      await scenario();

      expect((await list(adminToken, "?from=2026-02-31")).status).toBe(400);
      expect((await list(adminToken, "?from=2026-10-10&to=2026-10-01")).status).toBe(400);
      expect((await list(adminToken, "?status=XYZ")).status).toBe(400);
      expect((await list(adminToken, "?clientId=nao-existe")).status).toBe(404);
      expect((await list(adminToken, "?occurrenceId=nao-existe")).status).toBe(404);
    });
  });

  describe("prévia de elegibilidade", () => {
    const query = (clientId: string, occurrenceId: string, extra = "") =>
      `clientId=${clientId}&occurrenceId=${occurrenceId}${extra}`;

    it("informa que pode reservar e as vagas atuais", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3), { capacity: 5 });
      await reserveFor(adminToken, (await createClient("bia")).user.id, occurrence.id);

      const response = await preview(adminToken, query(ana.user.id, occurrence.id));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        canBook: true,
        capacity: 5,
        availableSpots: 4,
        reason: null,
      });
    });

    it("explica a recusa: lotada, já inscrito, conflito, indisponível e cliente inativo", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const startsAt = inFuture(3);
      const full = await createOccurrence(startsAt, { capacity: 1 });
      await reserveFor(adminToken, bia.user.id, full.id);
      const overlapping = await createOccurrence(new Date(startsAt.getTime() + 30 * MINUTE), {
        name: "Yoga",
      });
      const cancelled = await createOccurrence(inFuture(9), {
        name: "Boxe",
        status: "CANCELLED",
      });
      const inactive = await createClient("caio", "INACTIVE");

      const fullPreview = await preview(adminToken, query(ana.user.id, full.id));
      expect(fullPreview.body).toMatchObject({
        canBook: false,
        availableSpots: 0,
        reason: { code: "CLASS_FULL", details: { currentAvailableSpots: 0 } },
      });

      const duplicate = await preview(adminToken, query(bia.user.id, full.id));
      expect(duplicate.body).toMatchObject({
        canBook: false,
        reason: { code: "DUPLICATE_RESERVATION" },
      });

      const conflict = await preview(adminToken, query(bia.user.id, overlapping.id));
      expect(conflict.body).toMatchObject({
        canBook: false,
        reason: {
          code: "SCHEDULE_CONFLICT",
          details: { reservation: { occurrence: { id: full.id } } },
        },
      });

      const notBookable = await preview(adminToken, query(ana.user.id, cancelled.id));
      expect(notBookable.body).toMatchObject({
        canBook: false,
        reason: { code: "OCCURRENCE_NOT_BOOKABLE" },
      });

      const inactivePreview = await preview(adminToken, query(inactive.user.id, overlapping.id));
      expect(inactivePreview.body).toMatchObject({
        canBook: false,
        reason: { code: "USER_INACTIVE" },
      });
    });

    it("a prévia bate com o que a criação decide", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const occurrence = await createOccurrence(inFuture(3), { capacity: 1 });
      await reserveFor(adminToken, bia.user.id, occurrence.id);

      const previewed = await preview(adminToken, query(ana.user.id, occurrence.id));
      const created = await reserveFor(adminToken, ana.user.id, occurrence.id);

      expect(previewed.body.reason.code).toBe(created.body.code);
    });

    it("não grava nada: nem reserva, nem registro de idempotência, nem lock", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const before = {
        reservations: await testPrisma.reservation.count(),
        records: await testPrisma.idempotencyRecord.count(),
      };

      await preview(adminToken, query(ana.user.id, occurrence.id));
      await preview(adminToken, query(ana.user.id, occurrence.id));

      expect(await testPrisma.reservation.count()).toBe(before.reservations);
      expect(await testPrisma.idempotencyRecord.count()).toBe(before.records);
      // Ainda dá para reservar depois da prévia.
      expect((await reserveFor(adminToken, ana.user.id, occurrence.id)).status).toBe(201);
    });

    it("com replacingReservationId, simula a remarcação ignorando a reserva original", async () => {
      const ana = await createClient("ana");
      const startsAt = inFuture(3);
      const from = await createOccurrence(startsAt);
      const overlapping = await createOccurrence(new Date(startsAt.getTime() + 30 * MINUTE), {
        name: "Yoga",
      });
      const original = await reserveFor(adminToken, ana.user.id, from.id);

      const plain = await preview(adminToken, query(ana.user.id, overlapping.id));
      expect(plain.body.reason.code).toBe("SCHEDULE_CONFLICT");

      const replacing = await preview(
        adminToken,
        query(ana.user.id, overlapping.id, `&replacingReservationId=${original.body.id}`),
      );
      expect(replacing.body).toMatchObject({ canBook: true, reason: null });

      const sameClass = await preview(
        adminToken,
        query(ana.user.id, from.id, `&replacingReservationId=${original.body.id}`),
      );
      expect(sameClass.body.reason.code).toBe("DUPLICATE_RESERVATION");

      expect(
        (await testPrisma.reservation.findUniqueOrThrow({ where: { id: original.body.id } }))
          .status,
      ).toBe("CONFIRMED");
    });

    it("valida os parâmetros: cliente, aula e reserva de outro cliente", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const occurrence = await createOccurrence(inFuture(3));
      const other = await reserveFor(adminToken, bia.user.id, occurrence.id);

      expect((await preview(adminToken, "occurrenceId=x")).status).toBe(400);
      expect((await preview(adminToken, query("nao-existe", occurrence.id))).status).toBe(404);
      expect((await preview(adminToken, query(ana.user.id, "nao-existe"))).status).toBe(404);
      expect(
        (
          await preview(
            adminToken,
            query(ana.user.id, occurrence.id, `&replacingReservationId=${other.body.id}`),
          )
        ).status,
      ).toBe(403);
    });
  });

  describe("busca de clientes para reservar", () => {
    const lookup = (token: string, query = "") =>
      request(app.getHttpServer())
        .get(`/api/admin/reservations/clients${query}`)
        .set("Authorization", `Bearer ${token}`);

    it("devolve id, nome e e-mail só dos clientes ativos, em ordem de nome, e filtra pela busca", async () => {
      const bia = await createClient("bia");
      const ana = await createClient("ana");
      await createClient("caio", "INACTIVE");
      const deleted = await createClient("dora");
      await testPrisma.user.update({ where: { id: deleted.user.id }, data: { status: "DELETED" } });

      const all = await lookup(adminToken);
      const searched = await lookup(adminToken, "?search=BI");

      expect(all.status).toBe(200);
      // Só id, nome e e-mail: nada de telefone, documento ou endereço; equipe não aparece.
      expect(all.body).toEqual([
        { id: ana.user.id, fullName: "ana", email: "ana@fitburn.local" },
        { id: bia.user.id, fullName: "bia", email: "bia@fitburn.local" },
      ]);
      expect(searched.body).toEqual([
        { id: bia.user.id, fullName: "bia", email: "bia@fitburn.local" },
      ]);
    });

    it("funciona só com a permissão de Reservas (sem o módulo Clientes) e exige ver reservas", async () => {
      const ana = await createClient("ana");
      const viewer = await createStaff("vera", { actions: ["VIEW"], scope: "ALL" });
      const creatorOnly = await createStaff("carla", { actions: ["CREATE"], scope: "ALL" });

      const allowed = await lookup(viewer.token);

      expect(allowed.status).toBe(200);
      expect(allowed.body.map((item: { id: string }) => item.id)).toEqual([ana.user.id]);
      expect((await lookup(creatorOnly.token)).status).toBe(403);
      expect((await lookup(ana.token)).status).toBe(403);
      expect((await request(app.getHttpServer()).get("/api/admin/reservations/clients")).status).toBe(
        401,
      );
    });

    it("respeita o escopo do professor", async () => {
      const ana = await createClient("ana");
      await createClient("bia");
      const teacher = await createStaff("paulo", { actions: ["VIEW"], scope: "ASSIGNED_CLIENTS" });
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: teacher.user.id, clientId: ana.user.id },
      });

      const response = await lookup(teacher.token);

      expect(response.body.map((item: { id: string }) => item.id)).toEqual([ana.user.id]);
    });
  });

  describe("permissões e escopo", () => {
    it("exige login e uma permissão do módulo Reservas", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const reserved = await reserveFor(adminToken, ana.user.id, occurrence.id);

      const anonymous = await request(app.getHttpServer()).get("/api/admin/reservations");
      expect(anonymous.status).toBe(401);

      // Cliente não tem o módulo: nada disso é do autoatendimento.
      expect((await list(ana.token)).status).toBe(403);
      expect((await reserveFor(ana.token, ana.user.id, occurrence.id)).status).toBe(403);
      expect((await cancelFor(ana.token, reserved.body.id)).status).toBe(403);
      expect(
        (await preview(ana.token, `clientId=${ana.user.id}&occurrenceId=${occurrence.id}`)).status,
      ).toBe(403);
    });

    it("cada ação exige a sua: ver, criar e editar (cancelar e remarcar)", async () => {
      const ana = await createClient("ana");
      const occurrence = await createOccurrence(inFuture(3));
      const other = await createOccurrence(inFuture(6), { name: "Yoga" });
      const reserved = await reserveFor(adminToken, ana.user.id, occurrence.id);
      const viewer = await createStaff("vera", { actions: ["VIEW"], scope: "ALL" });
      const creator = await createStaff("carla", { actions: ["VIEW", "CREATE"], scope: "ALL" });

      expect((await list(viewer.token)).status).toBe(200);
      expect((await reserveFor(viewer.token, ana.user.id, other.id)).status).toBe(403);
      expect((await cancelFor(viewer.token, reserved.body.id)).status).toBe(403);
      expect((await rescheduleFor(viewer.token, reserved.body.id, other.id)).status).toBe(403);

      expect((await reserveFor(creator.token, ana.user.id, other.id)).status).toBe(201);
      expect((await cancelFor(creator.token, reserved.body.id)).status).toBe(403);
    });

    it("professor só enxerga e age sobre clientes do seu escopo", async () => {
      const ana = await createClient("ana");
      const bia = await createClient("bia");
      const teacher = await createStaff("paulo", {
        actions: ["VIEW", "CREATE", "EDIT"],
        scope: "ASSIGNED_CLIENTS",
      });
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: teacher.user.id, clientId: ana.user.id },
      });
      const occurrence = await createOccurrence(inFuture(3));
      const other = await createOccurrence(inFuture(6), { name: "Yoga" });
      const anaReservation = await reserveFor(adminToken, ana.user.id, occurrence.id);
      const biaReservation = await reserveFor(adminToken, bia.user.id, occurrence.id);

      const listed = await list(teacher.token);
      expect(listed.body.map((item: { id: string }) => item.id)).toEqual([anaReservation.body.id]);

      expect((await list(teacher.token, `?clientId=${bia.user.id}`)).status).toBe(403);
      const denied = await reserveFor(teacher.token, bia.user.id, other.id);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("OUT_OF_SCOPE");
      expect((await cancelFor(teacher.token, biaReservation.body.id)).status).toBe(403);
      expect((await rescheduleFor(teacher.token, biaReservation.body.id, other.id)).status).toBe(
        403,
      );
      expect(
        (await preview(teacher.token, `clientId=${bia.user.id}&occurrenceId=${other.id}`)).status,
      ).toBe(403);

      expect((await reserveFor(teacher.token, ana.user.id, other.id)).status).toBe(201);
      expect((await cancelFor(teacher.token, anaReservation.body.id)).status).toBe(200);
    });
  });
});
