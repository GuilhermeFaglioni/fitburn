import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { vi } from "vitest";
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
const DAY = 24 * 60 * 60_000;

const NEW_CLIENT = {
  fullName: "Carla Nova",
  email: "carla@fitburn.local",
  phone: "11999990000",
  birthDate: "1995-05-20",
  document: "111.222.333-44",
  address: "Rua das Flores, 10",
  password: PASSWORD,
};

describe("Clientes (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let clientProfileId: string;
  let teacherProfileId: string;

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
    teacherProfileId = (await createAccessProfile({ name: "Professor" })).id;
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "CLIENTES",
      actions: ["VIEW", "EDIT"],
      scope: "ASSIGNED_CLIENTS",
    });
  });

  async function signIn(
    name: string,
    profileId: string,
    extra: { document?: string; status?: "ACTIVE" | "INACTIVE" } = {},
  ) {
    const user = await createUser({
      email: `${name.toLowerCase().replace(/ /g, ".")}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: name,
      ...extra,
    });
    // Inativo não entra: o token, quando o teste precisa, vem de um login anterior à desativação.
    const token =
      user.status === "ACTIVE" ? await loginAndGetAccessToken(app, user.email, PASSWORD) : "";
    return { user, token };
  }

  const createAdmin = () => signIn("admin", adminProfileId);
  const createTeacher = (name: string) => signIn(name, teacherProfileId);
  const createClient = (name: string, extra: Parameters<typeof signIn>[2] = {}) =>
    signIn(name, clientProfileId, extra);

  const get = (token: string, path: string) =>
    request(app.getHttpServer()).get(`/api/clients${path}`).set("Authorization", `Bearer ${token}`);
  const post = (token: string, path: string, body?: object) =>
    request(app.getHttpServer())
      .post(`/api/clients${path}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  const patch = (token: string, path: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/clients${path}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const names = (body: Array<{ fullName: string }>) => body.map((item) => item.fullName);

  describe("Lista", () => {
    it("lista só clientes, em ordem alfabética, com o plano ativo de cada um", async () => {
      const admin = await createAdmin();
      await createTeacher("rafael");
      const bruno = await createClient("bruno");
      await createClient("ana");
      const plan = await testPrisma.plan.create({ data: { name: "Plano Trimestral" } });
      await testPrisma.planAssignment.create({
        data: {
          planId: plan.id,
          clientId: bruno.user.id,
          startDate: new Date(Date.now() - 5 * DAY),
          endDate: new Date(Date.now() + 60 * DAY),
          status: "ACTIVE",
        },
      });

      const response = await get(admin.token, "");

      expect(response.status).toBe(200);
      expect(names(response.body)).toEqual(["ana", "bruno"]);
      expect(response.body[0].activePlan).toBeNull();
      expect(response.body[1].activePlan).toMatchObject({ name: "Plano Trimestral" });
    });

    it("um plano vencido não aparece como plano ativo", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const plan = await testPrisma.plan.create({ data: { name: "Plano Antigo" } });
      await testPrisma.planAssignment.create({
        data: {
          planId: plan.id,
          clientId: ana.user.id,
          startDate: new Date(Date.now() - 60 * DAY),
          endDate: new Date(Date.now() - 2 * DAY),
          status: "ACTIVE",
        },
      });

      const response = await get(admin.token, "");

      expect(response.body[0].activePlan).toBeNull();
    });

    it("busca por parte do nome, do e-mail ou do documento, sem diferenciar maiúsculas", async () => {
      const admin = await createAdmin();
      await createClient("Marina Souza", { document: "123.456.789-00" });
      await createClient("Bruno Lima", { document: "987.654.321-00" });

      const byName = await get(admin.token, "?search=MARINA");
      const byEmail = await get(admin.token, "?search=bruno.lima@fitburn");
      const byDocument = await get(admin.token, "?search=987.654");
      const none = await get(admin.token, "?search=zzz");

      expect(names(byName.body)).toEqual(["Marina Souza"]);
      expect(names(byEmail.body)).toEqual(["Bruno Lima"]);
      expect(names(byDocument.body)).toEqual(["Bruno Lima"]);
      expect(none.body).toEqual([]);
    });

    it("filtra por status e combina com a busca", async () => {
      const admin = await createAdmin();
      await createClient("ana");
      await createClient("amanda", { status: "INACTIVE" });
      await createClient("bruno", { status: "INACTIVE" });

      const active = await get(admin.token, "?status=ACTIVE");
      const inactive = await get(admin.token, "?status=INACTIVE");
      const combined = await get(admin.token, "?status=INACTIVE&search=am");
      const invalid = await get(admin.token, "?status=QUALQUER");

      expect(names(active.body)).toEqual(["ana"]);
      expect(names(inactive.body)).toEqual(["amanda", "bruno"]);
      expect(names(combined.body)).toEqual(["amanda"]);
      expect(invalid.status).toBe(400);
    });

    it("o professor vê só os clientes do seu escopo: reserva na aula dele ou atribuição manual", async () => {
      const rafael = await createTeacher("rafael");
      const paula = await createTeacher("paula");
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      await createClient("camila");
      const daniel = await createClient("daniel");
      const aulaDoRafael = await createOccurrence(new Date(Date.now() + DAY), {
        instructorId: rafael.user.id,
      });
      const aulaDaPaula = await createOccurrence(new Date(Date.now() + 2 * DAY), {
        instructorId: paula.user.id,
        name: "Yoga",
      });
      await createReservation(ana.user.id, aulaDoRafael.id);
      await createReservation(daniel.user.id, aulaDaPaula.id);
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: bruno.user.id },
      });

      const response = await get(rafael.token, "");
      const search = await get(rafael.token, "?search=camila");

      expect(names(response.body)).toEqual(["ana", "bruno"]);
      expect(search.body).toEqual([]);
    });

    it.each(["ASSIGNED_CLIENTS", "ASSIGNED_CLASSES"] as const)(
      "projeta clientes no escopo %s sem dados pessoais nem busca por documento",
      async (scope) => {
      const rafael = await createTeacher("rafael");
      await grantModuleAccess({
        profileId: teacherProfileId,
        module: "CLIENTES",
        actions: ["VIEW", "EDIT"],
        scope,
      });
      const ana = await createClient("Ana Souza", { document: "123.456.789-00" });
      await testPrisma.user.update({
        where: { id: ana.user.id },
        data: {
          phone: "11999990000",
          birthDate: new Date("1990-05-20"),
          address: "Rua das Flores, 10",
        },
      });
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: ana.user.id },
      });

      const listed = await get(rafael.token, "");
      const byDocument = await get(rafael.token, "?search=123.456.789-00");

      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([
        {
          id: ana.user.id,
          fullName: "Ana Souza",
          email: ana.user.email,
          phone: "11999990000",
          status: "ACTIVE",
        },
      ]);
      expect(byDocument.body).toEqual([]);
      },
    );

    it("quem não tem acesso ao módulo é recusado", async () => {
      const ana = await createClient("ana");

      const response = await get(ana.token, "");

      expect(response.status).toBe(403);
    });
  });

  describe("Detalhe consolidado", () => {
    it("traz dados pessoais, plano, reservas, gamificação e fichas do cliente", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const ana = await createClient("ana");
      const plan = await testPrisma.plan.create({ data: { name: "Plano Mensal" } });
      await testPrisma.planAssignment.create({
        data: {
          planId: plan.id,
          clientId: ana.user.id,
          startDate: new Date(Date.now() - 5 * DAY),
          endDate: new Date(Date.now() + 25 * DAY),
          status: "ACTIVE",
        },
      });
      const future = await createOccurrence(new Date(Date.now() + 2 * DAY));
      const past = await createOccurrence(new Date(Date.now() - 3 * DAY), { name: "Pilates" });
      await createReservation(ana.user.id, future.id);
      await createReservation(ana.user.id, past.id, "COMPLETED");
      await testPrisma.workoutSheet.create({
        data: {
          clientId: ana.user.id,
          authorId: rafael.user.id,
          title: "Ficha A",
          exercises: { create: [{ name: "Agachamento", position: 0 }] },
        },
      });

      const response = await get(admin.token, `/${ana.user.id}`);

      expect(response.status).toBe(200);
      expect(response.body.client).toMatchObject({
        id: ana.user.id,
        fullName: "ana",
        status: "ACTIVE",
      });
      expect(response.body.plan.active.plan.name).toBe("Plano Mensal");
      expect(response.body.upcomingReservations).toHaveLength(1);
      expect(response.body.upcomingReservations[0].occurrence.name).toBe("Treino Funcional");
      expect(response.body.pastReservations).toHaveLength(1);
      expect(response.body.pastReservations[0].status).toBe("COMPLETED");
      expect(response.body.gamification).toMatchObject({ totalPoints: 0 });
      expect(response.body.workoutSheets).toHaveLength(1);
      expect(response.body.workoutSheets[0].title).toBe("Ficha A");
    });

    it("cliente fora do escopo do professor: 403 OUT_OF_SCOPE; inexistente ou não cliente: 404", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const ana = await createClient("ana");

      const outOfScope = await get(rafael.token, `/${ana.user.id}`);
      const missing = await get(admin.token, "/nao-existe");
      const notAClient = await get(admin.token, `/${rafael.user.id}`);

      expect(outOfScope.status).toBe(403);
      expect(outOfScope.body.code).toBe("OUT_OF_SCOPE");
      expect(missing.status).toBe(404);
      expect(notAClient.status).toBe(404);
    });

    it("devolve só a projeção reduzida no detalhe e na resposta de edição do professor", async () => {
      const rafael = await createTeacher("rafael");
      const ana = await createClient("Ana Souza", { document: "123.456.789-00" });
      await testPrisma.user.update({
        where: { id: ana.user.id },
        data: {
          phone: "11999990000",
          birthDate: new Date("1990-05-20"),
          address: "Rua das Flores, 10",
        },
      });
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: ana.user.id },
      });

      const detail = await get(rafael.token, `/${ana.user.id}`);
      const updated = await patch(rafael.token, `/${ana.user.id}`, { phone: "11988887777" });

      expect(detail.status).toBe(200);
      expect(detail.body.client).toEqual({
        id: ana.user.id,
        fullName: "Ana Souza",
        email: ana.user.email,
        phone: "11999990000",
        status: "ACTIVE",
      });
      expect(updated.status).toBe(200);
      expect(updated.body).toEqual({
        id: ana.user.id,
        fullName: "Ana Souza",
        email: ana.user.email,
        phone: "11988887777",
        status: "ACTIVE",
      });
    });
  });

  describe("Cadastro e edição", () => {
    it("cadastra um cliente com o perfil Cliente", async () => {
      const admin = await createAdmin();

      const response = await post(admin.token, "", NEW_CLIENT);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        fullName: "Carla Nova",
        email: "carla@fitburn.local",
        status: "ACTIVE",
        profile: { name: "Cliente" },
      });
      expect(response.body.passwordHash).toBeUndefined();
      const listed = await get(admin.token, "?search=carla");
      expect(names(listed.body)).toEqual(["Carla Nova"]);
    });

    it("cadastra vários clientes sem documento e endereço", async () => {
      const admin = await createAdmin();
      const { document: _document, address: _address, ...withoutOptionalFields } = NEW_CLIENT;

      const first = await post(admin.token, "", withoutOptionalFields);
      const second = await post(admin.token, "", {
        ...withoutOptionalFields,
        fullName: "Bruno Sem Documento",
        email: "bruno@fitburn.local",
      });

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ document: null, address: null });
      expect(second.status).toBe(201);
      expect(second.body).toMatchObject({ document: null, address: null });
    });

    it.each(["phone", "birthDate"])("exige %s no cadastro de cliente", async (field) => {
      const admin = await createAdmin();
      const { document: _document, address: _address, ...withoutOptionalFields } = NEW_CLIENT;
      const body = { ...withoutOptionalFields } as Record<string, unknown>;
      delete body[field];

      const response = await post(admin.token, "", body);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("recusa menor de 18 anos e aceita no aniversário exato e no dia seguinte em São Paulo", async () => {
      const previousTime = new Date();
      vi.setSystemTime(new Date("2026-10-19T02:30:00.000Z"));
      try {
        const admin = await createAdmin();
        const { document: _document, address: _address, ...base } = NEW_CLIENT;
        const underage = await post(admin.token, "", {
          ...base,
          birthDate: "2008-10-19",
        });
        const eighteenthBirthday = await post(admin.token, "", {
          ...base,
          email: "aniversario@fitburn.local",
          birthDate: "2008-10-18",
        });
        const dayAfterBirthday = await post(admin.token, "", {
          ...base,
          email: "maior@fitburn.local",
          birthDate: "2008-10-17",
        });

        expect(underage.status).toBe(400);
        expect(underage.body).toMatchObject({
          code: "CLIENT_UNDERAGE",
          message: "O cliente precisa ter pelo menos 18 anos.",
        });
        expect(eighteenthBirthday.status).toBe(201);
        expect(dayAfterBirthday.status).toBe(201);
      } finally {
        vi.setSystemTime(previousTime);
      }
    }, 30_000);

    it("recusa nascimento de menor de 18 anos na edição da equipe e do próprio cliente", async () => {
      const previousTime = new Date();
      vi.setSystemTime(new Date("2026-10-19T02:30:00.000Z"));
      try {
        const admin = await createAdmin();
        const client = await createClient("ana");
        await testPrisma.user.update({
          where: { id: client.user.id },
          data: {
            phone: NEW_CLIENT.phone,
            birthDate: new Date("2008-10-19T00:00:00.000Z"),
          },
        });

        const staffEdit = await patch(admin.token, `/${client.user.id}`, {
          birthDate: "2008-10-19",
        });
        const unrelatedEdit = await patch(admin.token, `/${client.user.id}`, {
          phone: "11988887777",
        });
        const ownEdit = await request(app.getHttpServer())
          .patch("/api/me")
          .set("Authorization", `Bearer ${client.token}`)
          .send({ birthDate: "2008-10-19" });

        for (const response of [staffEdit, ownEdit]) {
          expect(response.status).toBe(400);
          expect(response.body).toMatchObject({
            code: "CLIENT_UNDERAGE",
            message: "O cliente precisa ter pelo menos 18 anos.",
          });
        }
        expect(unrelatedEdit.status).toBe(200);
        expect(unrelatedEdit.body.phone).toBe("11988887777");
        expect(
          await testPrisma.user.findUniqueOrThrow({ where: { id: client.user.id } }),
        ).toMatchObject({ phone: "11988887777" });
      } finally {
        vi.setSystemTime(previousTime);
      }
    }, 20_000);

    it("recusa e-mail e documento já em uso, e dados inválidos", async () => {
      const admin = await createAdmin();
      await createClient("ana", { document: NEW_CLIENT.document });

      const documentTaken = await post(admin.token, "", NEW_CLIENT);
      const emailTaken = await post(admin.token, "", {
        ...NEW_CLIENT,
        email: "ana@fitburn.local",
        document: "000",
      });
      const invalid = await post(admin.token, "", { ...NEW_CLIENT, email: "invalido" });

      expect(documentTaken.status).toBe(409);
      expect(documentTaken.body.code).toBe("DOCUMENT_ALREADY_IN_USE");
      expect(emailTaken.status).toBe(409);
      expect(emailTaken.body.code).toBe("EMAIL_ALREADY_IN_USE");
      expect(invalid.status).toBe(400);
    });

    it("só quem enxerga todos os clientes cadastra", async () => {
      const teacherProfile = await createAccessProfile({ name: "Recepção limitada" });
      await grantModuleAccess({
        profileId: teacherProfile.id,
        module: "CLIENTES",
        actions: ["VIEW", "CREATE"],
        scope: "ASSIGNED_CLIENTS",
      });
      const limited = await signIn("limitada", teacherProfile.id);

      const response = await post(limited.token, "", NEW_CLIENT);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
    });

    it("edita os dados do cliente e recusa mudar perfil ou status", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");

      const edited = await patch(admin.token, `/${ana.user.id}`, {
        fullName: "Ana Paula",
        phone: "11988887777",
      });
      const forbiddenField = await patch(admin.token, `/${ana.user.id}`, {
        profileId: adminProfileId,
      });

      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ fullName: "Ana Paula", phone: "11988887777" });
      expect(forbiddenField.status).toBe(400);
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
      expect(stored.profileId).toBe(clientProfileId);
    });

    it.each(["phone", "birthDate"])(
      "recusa anular %s: para o cliente é obrigatório",
      async (field) => {
        const admin = await createAdmin();
        const ana = await createClient("ana");
        await testPrisma.user.update({
          where: { id: ana.user.id },
          data: {
            phone: "11999990000",
            birthDate: new Date("1990-01-02"),
            document: "12345678900",
            address: "Rua A, 1",
          },
        });

        const response = await patch(admin.token, `/${ana.user.id}`, {
          fullName: "Outro Nome",
          [field]: null,
        });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe("VALIDATION_ERROR");
        const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
        expect(stored.fullName).not.toBe("Outro Nome");
        expect(stored[field as "phone" | "birthDate" | "document" | "address"]).not.toBeNull();
      },
    );

    it("permite remover documento e endereço no cadastro do cliente", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana", { document: "12345678900" });

      const response = await patch(admin.token, `/${ana.user.id}`, {
        document: null,
        address: null,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ document: null, address: null });
    });

    it("o professor edita só clientes do seu escopo", async () => {
      const rafael = await createTeacher("rafael");
      const ana = await createClient("ana");
      const bruno = await createClient("bruno");
      await testPrisma.teacherClientAssignment.create({
        data: { teacherId: rafael.user.id, clientId: ana.user.id },
      });

      const inScope = await patch(rafael.token, `/${ana.user.id}`, { phone: "11977776666" });
      const outOfScope = await patch(rafael.token, `/${bruno.user.id}`, { phone: "11977776666" });

      expect(inScope.status).toBe(200);
      expect(outOfScope.status).toBe(403);
    });
  });

  describe("Desativação e reativação", () => {
    it("desativar impede o login e a reserva, mas não cancela as reservas existentes", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana");
      const existing = await createOccurrence(new Date(Date.now() + 2 * DAY));
      const other = await createOccurrence(new Date(Date.now() + 4 * DAY), { name: "Yoga" });
      const reservation = await createReservation(ana.user.id, existing.id);

      const deactivated = await post(admin.token, `/${ana.user.id}/deactivate`);

      expect(deactivated.status).toBe(201);
      expect(deactivated.body.status).toBe("INACTIVE");
      const stored = await testPrisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(stored.status).toBe("CONFIRMED");
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: ana.user.email, password: PASSWORD });
      expect(login.status).toBe(401);
      const booking = await request(app.getHttpServer())
        .post("/api/reservations")
        .set("Authorization", `Bearer ${ana.token}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ occurrenceId: other.id });
      expect(booking.status).toBeGreaterThanOrEqual(400);
      const overview = await get(admin.token, `/${ana.user.id}`);
      expect(overview.body.upcomingReservations).toHaveLength(1);
      expect(overview.body.upcomingReservations[0].status).toBe("CONFIRMED");
    });

    it("reativa o cliente, que volta a entrar", async () => {
      const admin = await createAdmin();
      const ana = await createClient("ana", { status: "INACTIVE" });

      const reactivated = await post(admin.token, `/${ana.user.id}/reactivate`);

      expect(reactivated.status).toBe(201);
      expect(reactivated.body.status).toBe("ACTIVE");
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: ana.user.email, password: PASSWORD });
      expect(login.status).toBe(201);
    });

    it("o professor desativa só clientes do seu escopo", async () => {
      const rafael = await createTeacher("rafael");
      const bruno = await createClient("bruno");

      const response = await post(rafael.token, `/${bruno.user.id}/deactivate`);

      expect(response.status).toBe(403);
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: bruno.user.id } });
      expect(stored.status).toBe("ACTIVE");
    });
  });
});
