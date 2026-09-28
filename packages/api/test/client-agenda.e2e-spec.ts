import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const HOUR = 60 * 60_000;

describe("Agenda do cliente (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function loginAsClient() {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({
      email: "cliente@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  async function createTemplate() {
    const modality = await testPrisma.modality.create({ data: { name: "Spinning" } });
    return testPrisma.classTemplate.create({
      data: { name: "Spinning 45min", durationMinutes: 45, capacity: 12, modalityId: modality.id },
    });
  }

  function createOccurrence(
    template: { id: string; modalityId: string; name: string },
    startsAt: Date,
    overrides: { status?: "SCHEDULED" | "CANCELLED"; capacity?: number } = {},
  ) {
    return testPrisma.classOccurrence.create({
      data: {
        templateId: template.id,
        modalityId: template.modalityId,
        name: template.name,
        description: "Alta intensidade",
        durationMinutes: 45,
        capacity: overrides.capacity ?? 12,
        status: overrides.status ?? "SCHEDULED",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      },
    });
  }

  function isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  it("lista só aulas futuras e não canceladas, com a disponibilidade", async () => {
    const token = await loginAsClient();
    const template = await createTemplate();
    const now = Date.now();
    await createOccurrence(template, new Date(now - 24 * HOUR)); // passada
    await createOccurrence(template, new Date(now - 10 * 60_000)); // já começou
    await createOccurrence(template, new Date(now + 2 * HOUR), { status: "CANCELLED" });
    const future = await createOccurrence(template, new Date(now + 3 * HOUR), { capacity: 10 });

    const response = await request(app.getHttpServer())
      .get(
        `/api/agenda?from=${isoDate(new Date(now - 48 * HOUR))}&to=${isoDate(new Date(now + 48 * HOUR))}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: future.id,
      name: "Spinning 45min",
      description: "Alta intensidade",
      modality: { name: "Spinning" },
      capacity: 10,
      available: 10,
    });
  });

  it("devolve o detalhe de uma aula futura e 404 para cancelada", async () => {
    const token = await loginAsClient();
    const template = await createTemplate();
    const future = await createOccurrence(template, new Date(Date.now() + 3 * HOUR));
    const cancelled = await createOccurrence(template, new Date(Date.now() + 6 * HOUR), {
      status: "CANCELLED",
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/agenda/${future.id}`)
      .set("Authorization", `Bearer ${token}`);
    const missing = await request(app.getHttpServer())
      .get(`/api/agenda/${cancelled.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: future.id, available: 12 });
    expect(missing.status).toBe(404);
  });

  it("exige login", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/agenda?from=2026-10-05&to=2026-10-11",
    );

    expect(response.status).toBe(401);
  });
});
