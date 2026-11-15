import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const BASE = "/api/bioimpedance/assessments";
const CONSENT = "/api/bioimpedance/consent";

/** Medidas fictícias e coerentes entre si (soma da composição = peso). */
const MEASURES = {
  weight: { value: 69.2, rangeMin: 56, rangeMax: 75.7, rating: "NORMAL" },
  totalBodyWater: { value: 40.9 },
  protein: { value: 11.2 },
  minerals: { value: 3.82 },
  bodyFatMass: { value: 13.3 },
  bodyFatPercent: { value: 19.2 },
  leanLeftArm: { value: 3.08, percent: 102.6, rating: "NORMAL" },
};

const body = (clientId: string, overrides: Record<string, unknown> = {}) => ({
  clientId,
  measuredAt: "2026-11-11T09:11:00.000Z",
  heightCm: 172,
  age: 30,
  source: "MANUAL",
  measures: MEASURES,
  ...overrides,
});

describe("Avaliações de bioimpedância (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let clientProfileId: string;
  let teacherProfileId: string;
  let noAccessProfileId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    adminProfileId = (await createAccessProfile({ name: "Administrador", isSystem: true })).id;
    clientProfileId = (await createAccessProfile({ name: "Cliente", isSystem: true })).id;
    teacherProfileId = (await createAccessProfile({ name: "Professor" })).id;
    noAccessProfileId = (await createAccessProfile({ name: "Recepção" })).id;
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "BIOIMPEDANCIA",
      actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
      scope: "ASSIGNED_CLIENTS",
    });
    await grantModuleAccess({
      profileId: adminProfileId,
      module: "BIOIMPEDANCIA",
      actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
      scope: "ALL",
    });
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

  const createAdmin = () => signIn("admin", adminProfileId);
  const createTeacher = (name: string) => signIn(name, teacherProfileId);
  const createClient = (name: string) => signIn(name, clientProfileId);

  function api(token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    const http = () => request(app.getHttpServer());
    return {
      consent: (consented: boolean) => http().patch(CONSENT).set(auth).send({ consented }),
      create: (payload: unknown) => http().post(BASE).set(auth).send(payload as object),
      list: (query = "") => http().get(`${BASE}${query}`).set(auth),
      one: (id: string) => http().get(`${BASE}/${id}`).set(auth),
      update: (id: string, payload: unknown) =>
        http().patch(`${BASE}/${id}`).set(auth).send(payload as object),
      remove: (id: string) => http().delete(`${BASE}/${id}`).set(auth),
      clients: () => http().get(`${BASE}/clients`).set(auth),
      mine: () => http().get(`${BASE}/mine`).set(auth),
      mineOne: (id: string) => http().get(`${BASE}/mine/${id}`).set(auth),
      removeMine: (id: string) => http().delete(`${BASE}/mine/${id}`).set(auth),
    };
  }

  async function consentedClient(name = "cliente") {
    const client = await createClient(name);
    await api(client.token).consent(true);
    return client;
  }

  describe("permissão", () => {
    it("exige autenticação e o módulo Bioimpedância", async () => {
      expect((await request(app.getHttpServer()).get(BASE)).status).toBe(401);
      const noAccess = await signIn("recepcao", noAccessProfileId);
      expect((await api(noAccess.token).list()).status).toBe(403);
      expect((await api(noAccess.token).create(body("x"))).status).toBe(403);
      const client = await consentedClient();
      expect((await api(client.token).list()).status).toBe(403);
      expect((await api(client.token).create(body(client.user.id))).status).toBe(403);
    });

    it("respeita cada ação: Ver sem Criar não registra", async () => {
      const viewOnly = (await createAccessProfile({ name: "Leitura" })).id;
      await grantModuleAccess({
        profileId: viewOnly,
        module: "BIOIMPEDANCIA",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const reader = await signIn("leitor", viewOnly);
      const client = await consentedClient();
      expect((await api(reader.token).list()).status).toBe(200);
      expect((await api(reader.token).create(body(client.user.id))).status).toBe(403);
    });
  });

  describe("registro e consentimento", () => {
    it("registra com consentimento vigente e devolve origem, autor e medidas", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      const response = await api(admin.token).create(body(client.user.id));
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        clientId: client.user.id,
        clientName: "cliente",
        source: "MANUAL",
        authorName: "admin",
        heightCm: 172,
        age: 30,
        schemaVersion: 1,
        measuredAt: "2026-11-11T09:11:00.000Z",
      });
      expect(response.body.measures.weight.value).toBe(69.2);
      const stored = await testPrisma.bioimpedanceAssessment.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.authorId).toBe(admin.user.id);
    });

    it("recusa registrar sem consentimento (403 com código próprio) e nada é gravado", async () => {
      const admin = await createAdmin();
      const client = await createClient("sem-decisao");
      const response = await api(admin.token).create(body(client.user.id));
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("BIOIMPEDANCE_CONSENT_REQUIRED");
      expect(await testPrisma.bioimpedanceAssessment.count()).toBe(0);
    });

    it("com o consentimento revogado, a equipe não lê nem escreve; o cliente mantém e exclui as dele", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      const created = await api(admin.token).create(body(client.user.id));
      const id = created.body.id as string;

      await api(client.token).consent(false);

      const list = await api(admin.token).list(`?clientId=${client.user.id}`);
      expect(list.status).toBe(200);
      expect(list.body).toEqual({ items: [], hiddenReason: "CONSENT_REVOKED" });
      expect((await api(admin.token).list()).body.items).toEqual([]);
      for (const response of [
        await api(admin.token).one(id),
        await api(admin.token).create(body(client.user.id, { measuredAt: "2026-11-12T09:00:00.000Z" })),
        await api(admin.token).update(id, { age: 31 }),
        await api(admin.token).remove(id),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("BIOIMPEDANCE_CONSENT_REQUIRED");
      }

      const mine = await api(client.token).mine();
      expect(mine.status).toBe(200);
      expect(mine.body).toHaveLength(1);
      expect((await api(client.token).mineOne(id)).body.measures.weight.value).toBe(69.2);
      expect((await api(client.token).removeMine(id)).status).toBe(204);
      expect(await testPrisma.bioimpedanceAssessment.count()).toBe(0);
    });

    it("quem nunca decidiu aparece como sem consentimento na lista do cliente", async () => {
      const admin = await createAdmin();
      const client = await createClient("sem-decisao");
      const list = await api(admin.token).list(`?clientId=${client.user.id}`);
      expect(list.body).toEqual({ items: [], hiddenReason: "CONSENT_MISSING" });
    });

    it("autorizar de novo devolve as avaliações à equipe", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      await api(admin.token).create(body(client.user.id));
      await api(client.token).consent(false);
      await api(client.token).consent(true);
      const list = await api(admin.token).list(`?clientId=${client.user.id}`);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.hiddenReason).toBeNull();
    });

    it("lista os clientes do escopo com a situação do consentimento", async () => {
      const admin = await createAdmin();
      await consentedClient("autorizou");
      await createClient("pendente");
      const response = await api(admin.token).clients();
      expect(response.status).toBe(200);
      const byName = Object.fromEntries(
        (response.body as Array<{ fullName: string; consented: boolean; consentedAt: string | null }>).map(
          (c) => [c.fullName, c],
        ),
      );
      expect(byName["autorizou"]?.consented).toBe(true);
      expect(byName["autorizou"]?.consentedAt).toEqual(expect.any(String));
      expect(byName["pendente"]).toMatchObject({ consented: false, consentedAt: null });
    });
  });

  describe("validação e unicidade", () => {
    it("exige peso e data; recusa chave desconhecida, valor fora dos limites e data futura", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      const post = (overrides: Record<string, unknown>) =>
        api(admin.token).create(body(client.user.id, overrides));

      const noWeight = await post({ measures: { totalBodyWater: { value: 40 } } });
      expect(noWeight.status).toBe(400);
      expect(noWeight.body.code).toBe("VALIDATION_ERROR");
      expect((await post({ measures: { weight: { value: 5 } } })).status).toBe(400);
      expect((await post({ measures: { weight: { value: 999 } } })).status).toBe(400);
      expect((await post({ measures: { ...MEASURES, invented: { value: 1 } } })).status).toBe(400);
      expect((await post({ measures: { ...MEASURES, visceralFatLevel: { value: 99 } } })).status).toBe(400);
      expect((await post({ measuredAt: "2999-01-01T00:00:00.000Z" })).status).toBe(400);
      expect((await post({ measuredAt: "ontem" })).status).toBe(400);
      expect((await post({ source: "OUTRA" })).status).toBe(400);
      expect(await testPrisma.bioimpedanceAssessment.count()).toBe(0);
    });

    it("aceita laudos antigos: só o peso é obrigatório", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      const response = await api(admin.token).create(
        body(client.user.id, { measures: { weight: { value: 80 } }, heightCm: undefined, age: undefined }),
      );
      expect(response.status).toBe(201);
      expect(response.body.heightCm).toBeNull();
    });

    it("repetir (cliente, data e hora) dá 409; outro cliente ou outra hora pode", async () => {
      const admin = await createAdmin();
      const a = await consentedClient("a");
      const b = await consentedClient("b");
      expect((await api(admin.token).create(body(a.user.id))).status).toBe(201);
      const duplicate = await api(admin.token).create(body(a.user.id));
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe("ASSESSMENT_ALREADY_EXISTS");
      expect((await api(admin.token).create(body(b.user.id))).status).toBe(201);
      expect(
        (await api(admin.token).create(body(a.user.id, { measuredAt: "2026-11-11T09:12:00.000Z" }))).status,
      ).toBe(201);
    });
  });

  describe("editar e excluir", () => {
    it("corrige medidas e data, mantém a origem e recusa duplicar uma data existente", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      const first = await api(admin.token).create(body(client.user.id, { source: "FOTO_DO_LAUDO" }));
      const second = await api(admin.token).create(
        body(client.user.id, { measuredAt: "2026-10-01T09:00:00.000Z" }),
      );

      const edited = await api(admin.token).update(first.body.id, {
        measures: { weight: { value: 70.1 } },
        age: 31,
      });
      expect(edited.status).toBe(200);
      expect(edited.body.measures).toEqual({ weight: { value: 70.1 } });
      expect(edited.body.age).toBe(31);
      expect(edited.body.source).toBe("FOTO_DO_LAUDO");

      const clash = await api(admin.token).update(second.body.id, {
        measuredAt: "2026-11-11T09:11:00.000Z",
      });
      expect(clash.status).toBe(409);
      expect((await api(admin.token).update(first.body.id, {})).status).toBe(400);
      expect((await api(admin.token).update("nao-existe", { age: 30 })).status).toBe(404);
    });

    it("exclui fisicamente e registra na auditoria sem os valores", async () => {
      const admin = await createAdmin();
      const client = await consentedClient();
      const created = await api(admin.token).create(body(client.user.id));
      const response = await api(admin.token).remove(created.body.id);
      expect(response.status).toBe(204);
      expect(await testPrisma.bioimpedanceAssessment.count()).toBe(0);
      const events = await testPrisma.adminAuditEvent.findMany({
        where: { action: "BIOIMPEDANCE_ASSESSMENT_DELETED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorId: admin.user.id, targetId: client.user.id, changedFields: [] });
      expect((await api(admin.token).remove(created.body.id)).status).toBe(404);
    });
  });

  describe("escopo da equipe", () => {
    it("ASSIGNED_CLIENTS só enxerga e altera clientes atribuídos", async () => {
      const admin = await createAdmin();
      const teacher = await createTeacher("prof");
      const mine = await consentedClient("meu");
      const other = await consentedClient("outro");
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: teacher.user.id, clientId: mine.user.id },
      });
      const ownRecord = await api(admin.token).create(body(mine.user.id));
      const otherRecord = await api(admin.token).create(body(other.user.id));

      expect((await api(teacher.token).create(body(mine.user.id, { measuredAt: "2026-09-01T10:00:00.000Z" }))).status).toBe(201);
      const forbidden = await api(teacher.token).create(body(other.user.id, { measuredAt: "2026-09-01T10:00:00.000Z" }));
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe("OUT_OF_SCOPE");

      const list = await api(teacher.token).list();
      expect((list.body.items as Array<{ clientId: string }>).every((i) => i.clientId === mine.user.id)).toBe(true);
      expect(list.body.items).toHaveLength(2);
      expect((await api(teacher.token).list(`?clientId=${other.user.id}`)).status).toBe(403);
      expect((await api(teacher.token).one(otherRecord.body.id)).status).toBe(403);
      expect((await api(teacher.token).update(otherRecord.body.id, { age: 40 })).status).toBe(403);
      expect((await api(teacher.token).remove(otherRecord.body.id)).status).toBe(403);
      expect((await api(teacher.token).one(ownRecord.body.id)).status).toBe(200);
      const clients = await api(teacher.token).clients();
      expect((clients.body as Array<{ id: string }>).map((c) => c.id)).toEqual([mine.user.id]);
    });

    it("ALL enxerga todos e a lista vem das mais recentes para as mais antigas, com limite", async () => {
      const admin = await createAdmin();
      const a = await consentedClient("a");
      const b = await consentedClient("b");
      await api(admin.token).create(body(a.user.id, { measuredAt: "2026-01-10T10:00:00.000Z" }));
      await api(admin.token).create(body(b.user.id, { measuredAt: "2026-03-10T10:00:00.000Z" }));
      await api(admin.token).create(body(a.user.id, { measuredAt: "2026-02-10T10:00:00.000Z" }));
      const list = await api(admin.token).list();
      expect((list.body.items as Array<{ measuredAt: string }>).map((i) => i.measuredAt.slice(0, 7))).toEqual([
        "2026-03",
        "2026-02",
        "2026-01",
      ]);
      expect((await api(admin.token).list("?limit=2")).body.items).toHaveLength(2);
      expect((await api(admin.token).list("?from=2026-02-01T00:00:00Z")).body.items).toHaveLength(2);
    });
  });

  describe("cliente", () => {
    it("vê só as próprias avaliações: o cliente B não lê nem exclui as do cliente A", async () => {
      const admin = await createAdmin();
      const a = await consentedClient("a");
      const b = await consentedClient("b");
      const recordA = await api(admin.token).create(body(a.user.id));
      await api(admin.token).create(body(b.user.id));

      const mineA = await api(a.token).mine();
      expect(mineA.body).toHaveLength(1);
      expect(mineA.body[0].clientId).toBe(a.user.id);
      expect((await api(a.token).mineOne(recordA.body.id)).status).toBe(200);

      expect((await api(b.token).mineOne(recordA.body.id)).status).toBe(404);
      expect((await api(b.token).removeMine(recordA.body.id)).status).toBe(404);
      expect(await testPrisma.bioimpedanceAssessment.count()).toBe(2);
      expect((await api(b.token).mine()).body).toHaveLength(1);
    });

    it("exige autenticação nas rotas do cliente", async () => {
      expect((await request(app.getHttpServer()).get(`${BASE}/mine`)).status).toBe(401);
      expect((await request(app.getHttpServer()).delete(`${BASE}/mine/x`)).status).toBe(401);
    });
  });
});
