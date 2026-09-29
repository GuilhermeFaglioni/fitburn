import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { hashPassword } from "../src/auth/password.util.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

describe("Perfil / Minha conta (HTTP)", () => {
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
    const user = await testPrisma.user.create({
      data: {
        email: "marina@fitburn.local",
        passwordHash: await hashPassword(PASSWORD),
        fullName: "Marina Souza",
        phone: "31998765432",
        birthDate: new Date("1994-03-14"),
        document: "12345678900",
        address: "Rua das Palmeiras, 220",
        profileId: profile.id,
      },
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { profile, user, token };
  }

  describe("GET /api/me", () => {
    it("devolve os dados pessoais do próprio usuário", async () => {
      const { token, user } = await loginAsClient();

      const response = await request(app.getHttpServer())
        .get("/api/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: user.id,
        email: "marina@fitburn.local",
        fullName: "Marina Souza",
        phone: "31998765432",
        birthDate: "1994-03-14",
        document: "12345678900",
        address: "Rua das Palmeiras, 220",
        status: "ACTIVE",
        profile: { id: user.profileId, name: "Cliente" },
      });
    });

    it("funciona para a equipe, sem nenhuma permissão de módulo, com dados opcionais nulos", async () => {
      const profile = await createAccessProfile({ name: "Recepção" });
      await createUser({ email: "staff@fitburn.local", password: PASSWORD, profileId: profile.id });
      const token = await loginAndGetAccessToken(app, "staff@fitburn.local", PASSWORD);

      const response = await request(app.getHttpServer())
        .get("/api/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email: "staff@fitburn.local",
        phone: null,
        birthDate: null,
        document: null,
        address: null,
      });
    });

    it("recusa um usuário desativado depois do login com USER_INACTIVE", async () => {
      const { token, user } = await loginAsClient();
      await testPrisma.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });

      const response = await request(app.getHttpServer())
        .get("/api/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("USER_INACTIVE");
    });

    it("exige autenticação", async () => {
      const response = await request(app.getHttpServer()).get("/api/me");
      expect(response.status).toBe(401);
    });
  });

  describe("PATCH /api/me", () => {
    it("edita os próprios dados pessoais e persiste", async () => {
      const { token, user } = await loginAsClient();

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Marina S. Andrade",
          email: "marina.nova@fitburn.local",
          phone: "31911112222",
          birthDate: "1994-04-01",
          document: "98765432100",
          address: "Av. Brasil, 10",
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: user.id,
        fullName: "Marina S. Andrade",
        email: "marina.nova@fitburn.local",
        phone: "31911112222",
        birthDate: "1994-04-01",
        document: "98765432100",
        address: "Av. Brasil, 10",
      });

      const reread = await request(app.getHttpServer())
        .get("/api/me")
        .set("Authorization", `Bearer ${token}`);
      expect(reread.body.fullName).toBe("Marina S. Andrade");
    });

    it("mantém o que não foi enviado (edição parcial)", async () => {
      const { token } = await loginAsClient();

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ phone: "31900000000" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        phone: "31900000000",
        fullName: "Marina Souza",
        document: "12345678900",
      });
    });

    it("aceita o próprio e-mail e documento sem acusar conflito", async () => {
      const { token } = await loginAsClient();

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "marina@fitburn.local", document: "12345678900", fullName: "Marina" });

      expect(response.status).toBe(200);
    });

    it("recusa e-mail em uso por outra conta com EMAIL_ALREADY_IN_USE", async () => {
      const { token, profile } = await loginAsClient();
      await createUser({ email: "outra@fitburn.local", password: PASSWORD, profileId: profile.id });

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "outra@fitburn.local" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("EMAIL_ALREADY_IN_USE");
    });

    it("recusa documento em uso por outra conta com DOCUMENT_ALREADY_IN_USE", async () => {
      const { token, profile } = await loginAsClient();
      await createUser({
        email: "outra@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
        document: "11111111111",
      });

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ document: "11111111111" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("DOCUMENT_ALREADY_IN_USE");
    });

    it("valida o formato dos campos", async () => {
      const { token } = await loginAsClient();

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "isso-nao-e-email", birthDate: "14/03/1994", fullName: "" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it.each([
      ["profileId", { profileId: "qualquer-outro" }],
      ["status", { status: "INACTIVE" }],
      ["password", { password: "NovaSenha123!" }],
      ["passwordHash", { passwordHash: "x" }],
    ])("recusa a tentativa de alterar %s sem mudar nada", async (_field, forbidden) => {
      const { token, user } = await loginAsClient();

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Outro Nome", ...forbidden });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");

      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.fullName).toBe("Marina Souza");
      expect(stored.profileId).toBe(user.profileId);
      expect(stored.status).toBe("ACTIVE");
      expect(stored.passwordHash).toBe(user.passwordHash);
    });

    it.each([["phone"], ["birthDate"], ["document"], ["address"]])(
      "recusa anular %s de um cliente (cadastro obrigatório), sem mudar nada",
      async (field) => {
        const { token, user } = await loginAsClient();

        const response = await request(app.getHttpServer())
          .patch("/api/me")
          .set("Authorization", `Bearer ${token}`)
          .send({ fullName: "Outro Nome", [field]: null });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe("VALIDATION_ERROR");
        const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(stored.fullName).toBe("Marina Souza");
        expect(stored[field as "phone" | "birthDate" | "document" | "address"]).not.toBeNull();
      },
    );

    it("a equipe pode limpar telefone, data de nascimento, documento e endereço", async () => {
      const profile = await createAccessProfile({ name: "Recepção" });
      await createUser({
        email: "staff@fitburn.local",
        password: PASSWORD,
        profileId: profile.id,
        document: "22222222222",
      });
      const token = await loginAndGetAccessToken(app, "staff@fitburn.local", PASSWORD);

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ phone: null, birthDate: null, document: null, address: null });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        phone: null,
        birthDate: null,
        document: null,
        address: null,
      });
    });

    it("recusa um usuário desativado depois do login, sem alterar nada", async () => {
      const { token, user } = await loginAsClient();
      await testPrisma.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });

      const response = await request(app.getHttpServer())
        .patch("/api/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ fullName: "Outro Nome" });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("USER_INACTIVE");
      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.fullName).toBe("Marina Souza");
    });

    it("exige autenticação", async () => {
      const response = await request(app.getHttpServer()).patch("/api/me").send({ fullName: "X" });
      expect(response.status).toBe(401);
    });
  });
});
