import type { INestApplication } from "@nestjs/common";
import request from "supertest";
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
const MINUTE = 60_000;

describe("Atribuição de clientes a professores (HTTP)", () => {
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
    // O professor acompanha só os clientes atribuídos; gamificação de cliente é o consumidor do escopo.
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "GAMIFICACAO",
      actions: ["VIEW"],
      scope: "ASSIGNED_CLIENTS",
    });
    await grantModuleAccess({
      profileId: teacherProfileId,
      module: "CLIENTES",
      actions: ["VIEW"],
      scope: "ASSIGNED_CLIENTS",
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

  function assign(token: string, teacherId: string, clientId: string) {
    return request(app.getHttpServer())
      .post("/api/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({ teacherId, clientId });
  }

  function unassign(token: string, assignmentId: string) {
    return request(app.getHttpServer())
      .delete(`/api/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${token}`);
  }

  function list(token: string, query = "") {
    return request(app.getHttpServer())
      .get(`/api/assignments${query}`)
      .set("Authorization", `Bearer ${token}`);
  }

  /** O escopo "clientes atribuídos" em ação: a gamificação de um cliente pela equipe. */
  function viewClient(token: string, clientId: string) {
    return request(app.getHttpServer())
      .get(`/api/gamification/clients/${clientId}`)
      .set("Authorization", `Bearer ${token}`);
  }

  describe("Atribuir e remover", () => {
    it("o administrador atribui um cliente a um professor, lista e remove", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const marina = await createClient("marina");

      const created = await assign(admin.token, rafael.user.id, marina.user.id);
      const listed = await list(admin.token);
      const removed = await unassign(admin.token, created.body.id);
      const afterRemoval = await list(admin.token);

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        teacher: { id: rafael.user.id, fullName: "rafael" },
        client: { id: marina.user.id, fullName: "marina", email: "marina@fitburn.local" },
      });
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0].id).toBe(created.body.id);
      expect(removed.status).toBe(204);
      expect(afterRemoval.body).toEqual([]);
    });

    it("lista as atribuições de um professor só", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const paula = await createTeacher("paula");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      await assign(admin.token, rafael.user.id, marina.user.id);
      await assign(admin.token, paula.user.id, bruno.user.id);

      const response = await list(admin.token, `?teacherId=${rafael.user.id}`);

      expect(
        response.body.map((item: { client: { fullName: string } }) => item.client.fullName),
      ).toEqual(["marina"]);
    });

    it("o mesmo cliente pode ter mais de um professor, mas não duas vezes o mesmo", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const paula = await createTeacher("paula");
      const marina = await createClient("marina");

      const first = await assign(admin.token, rafael.user.id, marina.user.id);
      const second = await assign(admin.token, paula.user.id, marina.user.id);
      const duplicate = await assign(admin.token, rafael.user.id, marina.user.id);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe("CLIENT_ALREADY_ASSIGNED");
      expect(await testPrisma.teacherClientAssignment.count()).toBe(2);
    });

    it("recusa quem não é professor (equipe ativa), quem não é cliente ativo e ids inexistentes", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const marina = await createClient("marina");
      const inactive = await createTeacher("inativo");
      await testPrisma.user.update({
        where: { id: inactive.user.id },
        data: { status: "INACTIVE" },
      });

      const clientAsTeacher = await assign(admin.token, marina.user.id, marina.user.id);
      const inactiveTeacher = await assign(admin.token, inactive.user.id, marina.user.id);
      const staffAsClient = await assign(admin.token, rafael.user.id, rafael.user.id);
      const unknownClient = await assign(admin.token, rafael.user.id, "nao-existe");
      const inactiveClient = await createClient("inativa");
      await testPrisma.user.update({
        where: { id: inactiveClient.user.id },
        data: { status: "INACTIVE" },
      });
      const inactiveAsClient = await assign(admin.token, rafael.user.id, inactiveClient.user.id);
      const invalidBody = await request(app.getHttpServer())
        .post("/api/assignments")
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ teacherId: rafael.user.id });

      expect(clientAsTeacher.status).toBe(400);
      expect(inactiveTeacher.status).toBe(400);
      expect(staffAsClient.status).toBe(400);
      expect(unknownClient.status).toBe(400);
      expect(inactiveAsClient.status).toBe(400);
      expect(invalidBody.status).toBe(400);
      expect(await testPrisma.teacherClientAssignment.count()).toBe(0);
    });

    it("remover uma atribuição que não existe responde 404", async () => {
      const admin = await createAdmin();

      const response = await unassign(admin.token, "nao-existe");

      expect(response.status).toBe(404);
    });

    it("as opções do formulário trazem professores e clientes ativos", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      await testPrisma.user.update({ where: { id: bruno.user.id }, data: { status: "INACTIVE" } });

      const response = await request(app.getHttpServer())
        .get("/api/assignments/options")
        .set("Authorization", `Bearer ${admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.teachers.map((teacher: { id: string }) => teacher.id).sort()).toEqual(
        [admin.user.id, rafael.user.id].sort(),
      );
      expect(response.body.clients).toEqual([
        { id: marina.user.id, fullName: "marina", email: "marina@fitburn.local" },
      ]);
    });
  });

  describe("Permissões", () => {
    it("quem não tem a permissão não atribui, não remove e não vê as opções; sem sessão é 401", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const marina = await createClient("marina");
      const created = await assign(admin.token, rafael.user.id, marina.user.id);

      const create = await assign(rafael.token, rafael.user.id, marina.user.id);
      const remove = await unassign(rafael.token, created.body.id);
      const options = await request(app.getHttpServer())
        .get("/api/assignments/options")
        .set("Authorization", `Bearer ${rafael.token}`);
      const asClient = await list(marina.token);
      const anonymous = await request(app.getHttpServer()).get("/api/assignments");

      expect(create.status).toBe(403);
      expect(remove.status).toBe(403);
      expect(options.status).toBe(403);
      expect(asClient.status).toBe(403);
      expect(anonymous.status).toBe(401);
      expect(await testPrisma.teacherClientAssignment.count()).toBe(1);
    });

    it("o professor com escopo de clientes atribuídos vê só as próprias atribuições", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const paula = await createTeacher("paula");
      const marina = await createClient("marina");
      const bruno = await createClient("bruno");
      await assign(admin.token, rafael.user.id, marina.user.id);
      await assign(admin.token, paula.user.id, bruno.user.id);

      const response = await list(rafael.token);
      const other = await list(rafael.token, `?teacherId=${paula.user.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].client.fullName).toBe("marina");
      expect(other.body).toEqual([]);
    });

    it("quem tem a ação de criar mas não escopo total é recusado com OUT_OF_SCOPE", async () => {
      const limitedProfile = await createAccessProfile({ name: "Coordenação" });
      await grantModuleAccess({
        profileId: limitedProfile.id,
        module: "CLIENTES",
        actions: ["VIEW", "CREATE", "DELETE"],
        scope: "ASSIGNED_CLIENTS",
      });
      const limited = await signIn("coordenacao", limitedProfile.id);
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const marina = await createClient("marina");
      const created = await assign(admin.token, rafael.user.id, marina.user.id);

      const create = await assign(limited.token, rafael.user.id, marina.user.id);
      const remove = await unassign(limited.token, created.body.id);

      expect(create.status).toBe(403);
      expect(create.body.code).toBe("OUT_OF_SCOPE");
      expect(remove.status).toBe(403);
      expect(remove.body.code).toBe("OUT_OF_SCOPE");
    });
  });

  describe('Escopo "clientes atribuídos"', () => {
    it("inclui os clientes com reserva nas aulas do professor e os atribuídos manualmente, e só eles", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const paula = await createTeacher("paula");
      const inClass = await createClient("naaula");
      const manual = await createClient("manual");
      const stranger = await createClient("estranho");
      const occurrence = await createOccurrence(new Date(Date.now() + 60 * MINUTE), {
        instructorId: rafael.user.id,
      });
      await createReservation(inClass.user.id, occurrence.id, "CONFIRMED");
      await assign(admin.token, rafael.user.id, manual.user.id);
      // A atribuição de outro professor não dá acesso ao Rafael.
      await assign(admin.token, paula.user.id, stranger.user.id);

      const byReservation = await viewClient(rafael.token, inClass.user.id);
      const byAssignment = await viewClient(rafael.token, manual.user.id);
      const outside = await viewClient(rafael.token, stranger.user.id);

      expect(byReservation.status).toBe(200);
      expect(byAssignment.status).toBe(200);
      expect(outside.status).toBe(403);
      expect(outside.body.code).toBe("OUT_OF_SCOPE");
    });

    it("o escopo de aulas atribuídas enxerga os clientes das duas origens; o próprio, só a si mesmo", async () => {
      const admin = await createAdmin();
      const byClassesProfile = await createAccessProfile({ name: "Por aulas" });
      await grantModuleAccess({
        profileId: byClassesProfile.id,
        module: "GAMIFICACAO",
        actions: ["VIEW"],
        scope: "ASSIGNED_CLASSES",
      });
      const ownProfile = await createAccessProfile({ name: "Só o próprio" });
      await grantModuleAccess({
        profileId: ownProfile.id,
        module: "GAMIFICACAO",
        actions: ["VIEW"],
        scope: "OWN",
      });
      const byClasses = await signIn("poraulas", byClassesProfile.id);
      const own = await signIn("proprio", ownProfile.id);
      const manual = await createClient("manual");
      const other = await createClient("outro");
      await assign(admin.token, byClasses.user.id, manual.user.id);
      await assign(admin.token, own.user.id, other.user.id);

      const viaAssignment = await viewClient(byClasses.token, manual.user.id);
      const notMine = await viewClient(byClasses.token, other.user.id);
      const ownScope = await viewClient(own.token, other.user.id);

      expect(viaAssignment.status).toBe(200);
      expect(notMine.body.code).toBe("OUT_OF_SCOPE");
      // Escopo "próprios" não olha atribuições: só a própria pessoa.
      expect(ownScope.body.code).toBe("OUT_OF_SCOPE");
    });

    it("remover a atribuição tira o acesso, mas a reserva na aula do professor continua dando", async () => {
      const admin = await createAdmin();
      const rafael = await createTeacher("rafael");
      const both = await createClient("ambos");
      const onlyManual = await createClient("manual");
      const occurrence = await createOccurrence(new Date(Date.now() + 60 * MINUTE), {
        instructorId: rafael.user.id,
      });
      await createReservation(both.user.id, occurrence.id, "CONFIRMED");
      const bothAssignment = await assign(admin.token, rafael.user.id, both.user.id);
      const manualAssignment = await assign(admin.token, rafael.user.id, onlyManual.user.id);

      await unassign(admin.token, bothAssignment.body.id);
      await unassign(admin.token, manualAssignment.body.id);

      expect((await viewClient(rafael.token, both.user.id)).status).toBe(200);
      expect((await viewClient(rafael.token, onlyManual.user.id)).status).toBe(403);
    });
  });
});
