import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { addDays, gymToday } from "@fitburn/contracts";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { PlansService } from "../src/plans/plans.service.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Planos: catálogo, atribuição e visão do cliente (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let clientProfileId: string;

  const today = gymToday();
  const inDays = (days: number) => addDays(today, days);

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
  const createClient = (name: string) => signIn(name, clientProfileId);

  function api(token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    const http = () => request(app.getHttpServer());
    return {
      createPlan: (body: unknown) =>
        http()
          .post("/api/plans")
          .set(auth)
          .send(body as object),
      listPlans: () => http().get("/api/plans").set(auth),
      updatePlan: (id: string, body: unknown) =>
        http()
          .patch(`/api/plans/${id}`)
          .set(auth)
          .send(body as object),
      deactivate: (id: string) => http().post(`/api/plans/${id}/deactivate`).set(auth),
      activate: (id: string) => http().post(`/api/plans/${id}/activate`).set(auth),
      options: () => http().get("/api/plans/options").set(auth),
      assign: (body: unknown) =>
        http()
          .post("/api/plan-assignments")
          .set(auth)
          .send(body as object),
      historyOf: (clientId: string) =>
        http().get(`/api/plan-assignments?clientId=${clientId}`).set(auth),
      mine: () => http().get("/api/plans/mine").set(auth),
    };
  }

  async function newPlan(token: string, name: string, description?: string) {
    const response = await api(token).createPlan({ name, description });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  const assignment = (clientId: string, planId: string, from: string, to: string) => ({
    clientId,
    planId,
    startDate: from,
    endDate: to,
  });

  describe("Catálogo", () => {
    it("o administrador cria, lista, edita, desativa e reativa planos", async () => {
      const admin = await createAdmin();

      const created = await api(admin.token).createPlan({
        name: "Plano Performance",
        description: "Acesso ilimitado",
      });
      const edited = await api(admin.token).updatePlan(created.body.id, {
        name: "Plano Performance Plus",
        description: null,
      });
      const deactivated = await api(admin.token).deactivate(created.body.id);
      const reactivated = await api(admin.token).activate(created.body.id);
      const listed = await api(admin.token).listPlans();

      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        name: "Plano Performance",
        description: "Acesso ilimitado",
        isActive: true,
        activeClientCount: 0,
      });
      expect(edited.body).toMatchObject({ name: "Plano Performance Plus", description: null });
      expect(deactivated.body.isActive).toBe(false);
      expect(reactivated.body.isActive).toBe(true);
      expect(listed.body).toHaveLength(1);
    });

    it("recusa nome repetido, nome vazio e plano inexistente", async () => {
      const admin = await createAdmin();
      const plan = await newPlan(admin.token, "Plano Essencial");

      const duplicate = await api(admin.token).createPlan({ name: "Plano Essencial" });
      const renamedToExisting = await api(admin.token).createPlan({ name: "Plano B" });
      const clash = await api(admin.token).updatePlan(renamedToExisting.body.id, {
        name: "Plano Essencial",
      });
      const empty = await api(admin.token).createPlan({ name: "  " });
      const missing = await api(admin.token).updatePlan("nao-existe", { name: "x" });
      const same = await api(admin.token).updatePlan(plan.id, { name: "Plano Essencial" });

      expect(duplicate.status).toBe(400);
      expect(clash.status).toBe(400);
      expect(empty.status).toBe(400);
      expect(missing.status).toBe(404);
      expect(same.status).toBe(200);
    });

    it("criações simultâneas com o mesmo nome: uma vence, as outras recebem a recusa de nome repetido (não 500)", async () => {
      const admin = await createAdmin();

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => api(admin.token).createPlan({ name: "Plano Corrida" })),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, ...Array(19).fill(400)]);
      const refused = responses.find((response) => response.status === 400);
      expect(refused?.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Já existe um plano com este nome.",
      });
      expect(await testPrisma.plan.count({ where: { name: "Plano Corrida" } })).toBe(1);
    });

    it("se a checagem de nome perde a corrida, a violação do índice único vira a mesma recusa (não 500)", async () => {
      const admin = await createAdmin();
      const service = app.get(PlansService) as unknown as { assertNameAvailable: () => unknown };
      await newPlan(admin.token, "Plano Corrida");
      const other = await newPlan(admin.token, "Plano B");
      // Simula a janela da corrida: a checagem passa, e só o banco enxerga o nome repetido.
      const check = vi.spyOn(service, "assertNameAvailable").mockResolvedValue(undefined);

      try {
        const created = await api(admin.token).createPlan({ name: "Plano Corrida" });
        const renamed = await api(admin.token).updatePlan(other.id, { name: "Plano Corrida" });

        for (const response of [created, renamed]) {
          expect(response.status).toBe(400);
          expect(response.body).toMatchObject({
            code: "VALIDATION_ERROR",
            message: "Já existe um plano com este nome.",
          });
        }
      } finally {
        check.mockRestore();
      }
    });

    it("a lista traz quantos clientes têm o plano ativo agora, sem contar os encerrados nem os vencidos", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      const camila = await createClient("camila");
      const plan = await newPlan(admin.token, "Plano Performance");
      const other = await newPlan(admin.token, "Plano Essencial");
      await api(admin.token).assign(assignment(ana.user.id, plan.id, inDays(-5), inDays(60)));
      await api(admin.token).assign(assignment(bruno.user.id, plan.id, inDays(-5), inDays(60)));
      // A Camila ficou com o plano vencido: o status no banco ainda é ativo, mas já não vale.
      await testPrisma.planAssignment.create({
        data: {
          planId: plan.id,
          clientId: camila.user.id,
          startDate: new Date(inDays(-30)),
          endDate: new Date(inDays(-1)),
          status: "ACTIVE",
        },
      });
      await api(admin.token).assign(assignment(bruno.user.id, other.id, inDays(0), inDays(30)));

      const listed = await api(admin.token).listPlans();

      const counts = Object.fromEntries(
        listed.body.map((item: { name: string; activeClientCount: number }) => [
          item.name,
          item.activeClientCount,
        ]),
      );
      expect(counts).toEqual({ "Plano Performance": 1, "Plano Essencial": 1 });
    });

    it("sem permissão no módulo Planos não mexe no catálogo; só visualizar não cria", async () => {
      const admin = await createAdmin();
      const plan = await newPlan(admin.token, "Plano Essencial");
      const viewerProfile = await createAccessProfile({ name: "Leitura" });
      await grantModuleAccess({
        profileId: viewerProfile.id,
        module: "PLANOS",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const viewer = await signIn("leitor", viewerProfile.id);
      const client = await createClient("marina");

      const asClient = await api(client.token).listPlans();
      const viewerList = await api(viewer.token).listPlans();
      const viewerCreate = await api(viewer.token).createPlan({ name: "Outro" });
      const viewerEdit = await api(viewer.token).updatePlan(plan.id, { name: "x" });
      const anonymous = await request(app.getHttpServer()).get("/api/plans");

      expect(asClient.status).toBe(403);
      expect(viewerList.status).toBe(200);
      expect(viewerCreate.status).toBe(403);
      expect(viewerEdit.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });
  });

  describe("Atribuição", () => {
    it("atribui um plano com as datas de início e término e o cliente passa a tê-lo ativo", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const plan = await newPlan(admin.token, "Plano Performance", "Acesso ilimitado");

      const response = await api(admin.token).assign(
        assignment(marina.user.id, plan.id, inDays(-2), inDays(90)),
      );
      const history = await api(admin.token).historyOf(marina.user.id);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        plan: { id: plan.id, name: "Plano Performance", description: "Acesso ilimitado" },
        startDate: inDays(-2),
        endDate: inDays(90),
        status: "ACTIVE",
      });
      expect(history.body).toHaveLength(1);
    });

    it("a nova atribuição encerra a anterior na mesma transação: no máximo um plano ativo", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const first = await newPlan(admin.token, "Plano Essencial");
      const second = await newPlan(admin.token, "Plano Performance");
      const firstAssignment = await api(admin.token).assign(
        assignment(marina.user.id, first.id, inDays(-30), inDays(60)),
      );

      const next = await api(admin.token).assign(
        assignment(marina.user.id, second.id, inDays(0), inDays(90)),
      );

      expect(next.status).toBe(201);
      const rows = await testPrisma.planAssignment.findMany({
        where: { clientId: marina.user.id },
      });
      expect(rows.filter((row) => row.status === "ACTIVE")).toHaveLength(1);
      const ended = rows.find((row) => row.id === firstAssignment.body.id)!;
      expect(ended.status).toBe("ENDED");
      // O plano anterior acaba na véspera do novo (ele iria até inDays(60)).
      expect(ended.endDate.toISOString().slice(0, 10)).toBe(inDays(-1));
    });

    it("o plano encerrado que já acabaria antes mantém a própria data de término", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const first = await newPlan(admin.token, "Plano Essencial");
      const second = await newPlan(admin.token, "Plano Performance");
      const firstAssignment = await api(admin.token).assign(
        assignment(marina.user.id, first.id, inDays(-30), inDays(-3)),
      );
      // (vencido) — ainda ativo no banco; a nova atribuição o encerra sem mexer nas datas.
      await testPrisma.planAssignment.update({
        where: { id: firstAssignment.body.id },
        data: { status: "ACTIVE" },
      });

      await api(admin.token).assign(assignment(marina.user.id, second.id, inDays(0), inDays(30)));

      const ended = await testPrisma.planAssignment.findUniqueOrThrow({
        where: { id: firstAssignment.body.id },
      });
      expect(ended.status).toBe("ENDED");
      expect(ended.endDate.toISOString().slice(0, 10)).toBe(inDays(-3));
    });

    it("duas atribuições simultâneas ao mesmo cliente: as duas valem em fila e sobra uma ativa", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const first = await newPlan(admin.token, "Plano Essencial");
      const second = await newPlan(admin.token, "Plano Performance");

      const [a, b] = await Promise.all([
        api(admin.token).assign(assignment(marina.user.id, first.id, inDays(0), inDays(30))),
        api(admin.token).assign(assignment(marina.user.id, second.id, inDays(0), inDays(30))),
      ]);

      expect([a.status, b.status]).toEqual([201, 201]);
      const rows = await testPrisma.planAssignment.findMany({
        where: { clientId: marina.user.id },
      });
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.status === "ACTIVE")).toHaveLength(1);
    });

    it("o banco também impede dois planos ativos para o mesmo cliente (índice único parcial)", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const plan = await newPlan(admin.token, "Plano Essencial");
      const data = {
        planId: plan.id,
        clientId: marina.user.id,
        startDate: new Date(inDays(0)),
        endDate: new Date(inDays(30)),
      };
      await testPrisma.planAssignment.create({ data: { ...data, status: "ACTIVE" } });

      await expect(
        testPrisma.planAssignment.create({ data: { ...data, status: "ACTIVE" } }),
      ).rejects.toThrow();
      await expect(
        testPrisma.planAssignment.create({ data: { ...data, status: "ENDED" } }),
      ).resolves.toBeDefined();
    });

    it("plano inativo não é atribuído: PLAN_INACTIVE, e o plano ativo do cliente continua", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const active = await newPlan(admin.token, "Plano Essencial");
      const inactive = await newPlan(admin.token, "Plano Antigo");
      await api(admin.token).deactivate(inactive.id);
      await api(admin.token).assign(assignment(marina.user.id, active.id, inDays(0), inDays(30)));

      const response = await api(admin.token).assign(
        assignment(marina.user.id, inactive.id, inDays(0), inDays(30)),
      );

      expect(response.status).toBe(422);
      expect(response.body.code).toBe("PLAN_INACTIVE");
      const rows = await testPrisma.planAssignment.findMany({
        where: { clientId: marina.user.id },
      });
      expect(rows.map((row) => [row.planId, row.status])).toEqual([[active.id, "ACTIVE"]]);
    });

    it("valida as datas, o plano e o cliente", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      await testPrisma.user.update({ where: { id: bruno.user.id }, data: { status: "INACTIVE" } });
      const plan = await newPlan(admin.token, "Plano Essencial");

      const backwards = await api(admin.token).assign(
        assignment(marina.user.id, plan.id, inDays(10), inDays(5)),
      );
      const badDate = await api(admin.token).assign(
        assignment(marina.user.id, plan.id, "2026-02-31", inDays(5)),
      );
      const noPlan = await api(admin.token).assign(
        assignment(marina.user.id, "nao-existe", inDays(0), inDays(5)),
      );
      const staffAsClient = await api(admin.token).assign(
        assignment(admin.user.id, plan.id, inDays(0), inDays(5)),
      );
      const inactiveClient = await api(admin.token).assign(
        assignment(bruno.user.id, plan.id, inDays(0), inDays(5)),
      );

      expect(backwards.status).toBe(400);
      expect(badDate.status).toBe(400);
      expect(noPlan.status).toBe(404);
      expect(staffAsClient.status).toBe(400);
      expect(inactiveClient.status).toBe(400);
      expect(await testPrisma.planAssignment.count()).toBe(0);
    });

    it("quem só visualiza ou é cliente não atribui; o histórico do cliente lista do mais recente ao mais antigo", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const old = await newPlan(admin.token, "Plano Essencial");
      const current = await newPlan(admin.token, "Plano Performance");
      await api(admin.token).assign(assignment(marina.user.id, old.id, inDays(-90), inDays(-31)));
      await api(admin.token).assign(
        assignment(marina.user.id, current.id, inDays(-30), inDays(60)),
      );
      const viewerProfile = await createAccessProfile({ name: "Leitura" });
      await grantModuleAccess({
        profileId: viewerProfile.id,
        module: "PLANOS",
        actions: ["VIEW"],
        scope: "ALL",
      });
      const viewer = await signIn("leitor", viewerProfile.id);

      const forbidden = await api(viewer.token).assign(
        assignment(marina.user.id, old.id, inDays(0), inDays(5)),
      );
      const asClient = await api(marina.token).assign(
        assignment(marina.user.id, old.id, inDays(0), inDays(5)),
      );
      const history = await api(viewer.token).historyOf(marina.user.id);

      expect(forbidden.status).toBe(403);
      expect(asClient.status).toBe(403);
      expect(history.body.map((item: { plan: { name: string } }) => item.plan.name)).toEqual([
        "Plano Performance",
        "Plano Essencial",
      ]);
    });

    it("o histórico de um id que não existe ou não é cliente devolve 404", async () => {
      const admin = await createAdmin();

      const unknown = await api(admin.token).historyOf("nao-existe");
      const staff = await api(admin.token).historyOf(admin.user.id);

      expect(unknown.status).toBe(404);
      expect(staff.status).toBe(404);
    });

    it("as opções trazem só planos ativos e clientes ativos, com o plano ativo de cada um", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const inactiveClient = await createClient("inativo");
      await testPrisma.user.update({
        where: { id: inactiveClient.user.id },
        data: { status: "INACTIVE" },
      });
      const plan = await newPlan(admin.token, "Plano Performance");
      const gone = await newPlan(admin.token, "Plano Antigo");
      await api(admin.token).deactivate(gone.id);
      await api(admin.token).assign(assignment(marina.user.id, plan.id, inDays(-1), inDays(20)));

      const response = await api(admin.token).options();

      expect(response.status).toBe(200);
      expect(response.body.plans).toEqual([{ id: plan.id, name: "Plano Performance" }]);
      expect(response.body.clients).toEqual([
        {
          id: bruno.user.id,
          fullName: "bruno",
          email: "bruno@fitburn.local",
          activePlan: null,
        },
        {
          id: marina.user.id,
          fullName: "marina",
          email: "marina@fitburn.local",
          activePlan: { name: "Plano Performance", endDate: inDays(20) },
        },
      ]);
    });
  });

  describe("O cliente vê o próprio plano", () => {
    it("o plano ativo e o histórico, só os dele", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      const essencial = await newPlan(admin.token, "Plano Essencial");
      const performance = await newPlan(admin.token, "Plano Performance", "Acesso ilimitado");
      await api(admin.token).assign(
        assignment(marina.user.id, essencial.id, inDays(-200), inDays(-101)),
      );
      await api(admin.token).assign(
        assignment(marina.user.id, performance.id, inDays(-100), inDays(50)),
      );
      await api(admin.token).assign(assignment(bruno.user.id, essencial.id, inDays(0), inDays(30)));

      const response = await api(marina.token).mine();

      expect(response.status).toBe(200);
      expect(response.body.active).toMatchObject({
        plan: { name: "Plano Performance", description: "Acesso ilimitado" },
        startDate: inDays(-100),
        endDate: inDays(50),
        status: "ACTIVE",
      });
      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0]).toMatchObject({
        plan: { name: "Plano Essencial" },
        status: "ENDED",
      });
    });

    it("um plano cujo término já passou aparece no histórico, como encerrado", async () => {
      const admin = await createAdmin();
      const marina = await createClient("marina");
      const plan = await newPlan(admin.token, "Plano Essencial");
      await testPrisma.planAssignment.create({
        data: {
          planId: plan.id,
          clientId: marina.user.id,
          startDate: new Date(inDays(-60)),
          endDate: new Date(inDays(-1)),
          status: "ACTIVE",
        },
      });

      const response = await api(marina.token).mine();

      expect(response.body.active).toBeNull();
      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0].status).toBe("ENDED");
    });

    it("sem plano nenhum: sem ativo e histórico vazio; sem sessão é 401", async () => {
      const marina = await createClient("marina");

      const response = await api(marina.token).mine();
      const anonymous = await request(app.getHttpServer()).get("/api/plans/mine");

      expect(response.body).toEqual({ active: null, history: [] });
      expect(anonymous.status).toBe(401);
    });
  });
});
