import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { BIOIMPEDANCE_CONSENT_VERSION } from "@fitburn/contracts";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const URL = "/api/bioimpedance/consent";

describe("Consentimento de bioimpedância (HTTP, D-042)", () => {
  let app: INestApplication;
  let token: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({
      email: "cliente@fitburn.local",
      password: PASSWORD,
      profileId: clientProfile.id,
      fullName: "Cliente Exemplo",
    });
    clientId = user.id;
    token = await loginAndGetAccessToken(app, user.email, PASSWORD);
  });

  const read = (bearer = token) =>
    request(app.getHttpServer()).get(URL).set("Authorization", `Bearer ${bearer}`);
  const change = (consented: boolean, bearer = token) =>
    request(app.getHttpServer())
      .patch(URL)
      .set("Authorization", `Bearer ${bearer}`)
      .send({ consented });
  const events = () =>
    testPrisma.userManifestation.findMany({
      where: { userId: clientId, type: "CONSENT_BIOIMPEDANCE" },
      orderBy: { sequence: "asc" },
    });

  it("exige autenticação", async () => {
    expect((await request(app.getHttpServer()).get(URL)).status).toBe(401);
    expect((await request(app.getHttpServer()).patch(URL).send({ consented: true })).status).toBe(
      401,
    );
  });

  it("sem decisão anterior: não autorizado, sem manifestação e com a versão vigente", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      consented: false,
      manifestation: null,
      currentVersion: BIOIMPEDANCE_CONSENT_VERSION,
    });
  });

  it("ida e volta: autorizar, revogar e autorizar de novo gera três eventos imutáveis", async () => {
    const granted = await change(true);
    expect(granted.status).toBe(200);
    expect(granted.body).toMatchObject({
      consented: true,
      manifestation: {
        userId: clientId,
        type: "CONSENT_BIOIMPEDANCE",
        action: "GRANTED",
        version: BIOIMPEDANCE_CONSENT_VERSION,
      },
    });
    expect((await read()).body.consented).toBe(true);

    const revoked = await change(false);
    expect(revoked.body).toMatchObject({
      consented: false,
      manifestation: { action: "REVOKED", version: BIOIMPEDANCE_CONSENT_VERSION },
    });
    expect((await read()).body.consented).toBe(false);

    expect((await change(true)).body.consented).toBe(true);

    const log = await events();
    expect(log.map((event) => event.action)).toEqual(["GRANTED", "REVOKED", "GRANTED"]);
    // Imutável: os eventos antigos continuam intactos, cada mudança é um registro novo.
    expect(new Set(log.map((event) => event.id)).size).toBe(3);
    expect(log[0].id).toBe(granted.body.manifestation.id);
  });

  it("repetir o mesmo estado é idempotente e não cria evento", async () => {
    await change(true);
    const again = await change(true);
    expect(again.status).toBe(200);
    expect(await events()).toHaveLength(1);

    await change(false);
    await change(false);
    expect(await events()).toHaveLength(2);
  });

  it("revogar sem nunca ter autorizado não cria evento", async () => {
    const response = await change(false);
    expect(response.status).toBe(200);
    expect(response.body.consented).toBe(false);
    expect(await events()).toHaveLength(0);
  });

  it("autorização de versão antiga deixa de ser a vigente e a nova autorização grava a versão atual", async () => {
    await testPrisma.userManifestation.create({
      data: {
        userId: clientId,
        type: "CONSENT_BIOIMPEDANCE",
        action: "GRANTED",
        version: "0",
      },
    });
    const response = await change(true);
    expect(response.body.manifestation.version).toBe(BIOIMPEDANCE_CONSENT_VERSION);
    expect(await events()).toHaveLength(2);
  });

  it("recusa corpo inválido", async () => {
    const response = await request(app.getHttpServer())
      .patch(URL)
      .set("Authorization", `Bearer ${token}`)
      .send({ consented: "sim", extra: 1 });
    expect(response.status).toBe(400);
    expect(await events()).toHaveLength(0);
  });

  it("não interfere no consentimento do ranking", async () => {
    await change(true);
    const ranking = await request(app.getHttpServer())
      .get("/api/gamification/ranking/consent")
      .set("Authorization", `Bearer ${token}`);
    expect(ranking.body.consented).toBe(false);
  });

  it("só cliente tem consentimento: outro perfil recebe 403", async () => {
    const staffProfile = await createAccessProfile({ name: "Recepção", isSystem: false });
    const staff = await createUser({
      email: "recepcao@fitburn.local",
      password: PASSWORD,
      profileId: staffProfile.id,
      fullName: "Recepção Exemplo",
    });
    const staffToken = await loginAndGetAccessToken(app, staff.email, PASSWORD);
    expect((await read(staffToken)).status).toBe(403);
    expect((await change(true, staffToken)).status).toBe(403);
    expect(
      await testPrisma.userManifestation.count({ where: { type: "CONSENT_BIOIMPEDANCE" } }),
    ).toBe(0);
  });
});
