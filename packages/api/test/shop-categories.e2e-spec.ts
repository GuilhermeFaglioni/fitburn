import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const BASE = "/api/shop/admin/categories";

describe("Loja: categorias no admin (HTTP)", () => {
  let app: INestApplication;
  let adminProfileId: string;
  let clientProfileId: string;

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
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  /** Equipe com a permissão LOJA nas ações dadas (vazio = sem acesso ao módulo). */
  async function teamWith(
    name: string,
    actions: Array<"VIEW" | "CREATE" | "EDIT" | "DELETE">,
    scope: "ALL" | "OWN" = "ALL",
  ): Promise<string> {
    const profile = await createAccessProfile({ name: `Equipe ${name}` });
    if (actions.length > 0) {
      await grantModuleAccess({ profileId: profile.id, module: "LOJA", actions, scope });
    }
    return signIn(name, profile.id);
  }

  function api(token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    const http = () => request(app.getHttpServer());
    return {
      list: () => http().get(BASE).set(auth),
      create: (body: unknown) => http().post(BASE).set(auth).send(body as object),
      reorder: (ids: unknown) => http().put(`${BASE}/order`).set(auth).send({ ids }),
      rename: (id: string, body: unknown) =>
        http().patch(`${BASE}/${id}`).set(auth).send(body as object),
      remove: (id: string) => http().delete(`${BASE}/${id}`).set(auth),
    };
  }

  async function newCategory(token: string, name: string): Promise<{ id: string }> {
    const response = await api(token).create({ name });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  /** Produto direto no banco, só para montar o cenário de uso da categoria. */
  function productIn(categoryId: string | null, options: { excluidoEm?: Date } = {}) {
    return testPrisma.product.create({
      data: {
        name: "Whey Teste",
        priceCents: 10_000,
        categoryId,
        excluidoEm: options.excluidoEm ?? null,
        variants: { create: { stock: 5 } },
      },
    });
  }

  describe("Permissões", () => {
    it("sem o módulo LOJA, equipe e cliente recebem 403 em todas as rotas", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      const noAccess = await teamWith("sem-acesso", []);
      const client = await signIn("cliente", clientProfileId);

      for (const token of [noAccess, client]) {
        const responses = [
          await api(token).list(),
          await api(token).create({ name: "Nova" }),
          await api(token).reorder([category.id]),
          await api(token).rename(category.id, { name: "Outra" }),
          await api(token).remove(category.id),
        ];
        for (const response of responses) {
          expect(response.status).toBe(403);
          expect(response.body.code).toBe("FORBIDDEN");
        }
      }
    });

    it("só Ver lista; criar, renomear, ordenar e excluir pedem a ação própria", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      const viewer = await teamWith("so-ver", ["VIEW"]);

      expect((await api(viewer).list()).status).toBe(200);
      expect((await api(viewer).create({ name: "Nova" })).status).toBe(403);
      expect((await api(viewer).reorder([category.id])).status).toBe(403);
      expect((await api(viewer).rename(category.id, { name: "Outra" })).status).toBe(403);
      expect((await api(viewer).remove(category.id)).status).toBe(403);
    });

    it("com Criar e Ver, cria mas não renomeia, ordena nem exclui", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      const creator = await teamWith("criador", ["VIEW", "CREATE"]);

      expect((await api(creator).create({ name: "Acessórios" })).status).toBe(201);
      expect((await api(creator).rename(category.id, { name: "Outra" })).status).toBe(403);
      expect((await api(creator).reorder([category.id])).status).toBe(403);
      expect((await api(creator).remove(category.id)).status).toBe(403);
    });

    it("escopo que não é total recebe 403 OUT_OF_SCOPE em todas as rotas, mesmo com todas as ações", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      const restricted = await teamWith("escopo-proprio", ["VIEW", "CREATE", "EDIT", "DELETE"], "OWN");

      const responses = [
        await api(restricted).list(),
        await api(restricted).create({ name: "Nova" }),
        await api(restricted).reorder([category.id]),
        await api(restricted).rename(category.id, { name: "Outra" }),
        await api(restricted).remove(category.id),
      ];
      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("OUT_OF_SCOPE");
      }
      expect(await testPrisma.shopCategory.count()).toBe(1);
    });
  });

  describe("Criação e listagem", () => {
    it("novas categorias entram no fim, com posições 1, 2 e 3 e productCount 0", async () => {
      const admin = await signIn("admin", adminProfileId);

      const first = await api(admin).create({ name: "Suplementos" });
      const second = await api(admin).create({ name: "Acessórios" });
      const third = await api(admin).create({ name: "Vestuário" });
      const listed = await api(admin).list();

      expect(first.status).toBe(201);
      expect(first.body).toEqual({
        id: expect.any(String),
        name: "Suplementos",
        position: 1,
        productCount: 0,
      });
      expect([second.body.position, third.body.position]).toEqual([2, 3]);
      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([
        expect.objectContaining({ name: "Suplementos", position: 1, productCount: 0 }),
        expect.objectContaining({ name: "Acessórios", position: 2, productCount: 0 }),
        expect.objectContaining({ name: "Vestuário", position: 3, productCount: 0 }),
      ]);
    });

    it("recusa nome vazio com 400 VALIDATION_ERROR", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).create({ name: "   " });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("recusa nome repetido com 409 CATEGORY_NAME_TAKEN, ignorando espaços nas pontas", async () => {
      const admin = await signIn("admin", adminProfileId);
      await newCategory(admin, "Suplementos");

      const response = await api(admin).create({ name: "  Suplementos " });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CATEGORY_NAME_TAKEN");
      expect(await testPrisma.shopCategory.count()).toBe(1);
    });

    it("criações simultâneas com o mesmo nome: uma vence, as demais recebem 409 (não 500)", async () => {
      const admin = await signIn("admin", adminProfileId);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => api(admin).create({ name: "Corrida" })),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);
      expect(await testPrisma.shopCategory.count()).toBe(1);
    });

    it("a categoria nova depois de uma exclusão entra no fim, não reaproveita a posição livre", async () => {
      const admin = await signIn("admin", adminProfileId);
      const first = await newCategory(admin, "Suplementos");
      await newCategory(admin, "Acessórios");
      await api(admin).remove(first.id);

      const created = await api(admin).create({ name: "Vestuário" });

      expect(created.body.position).toBe(3);
    });
  });

  describe("Renomear", () => {
    it("renomeia a categoria", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");

      const response = await api(admin).rename(category.id, { name: "Suplementos e vitaminas" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: category.id, name: "Suplementos e vitaminas" });
    });

    it("aceita manter o próprio nome", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");

      const response = await api(admin).rename(category.id, { name: "Suplementos" });

      expect(response.status).toBe(200);
    });

    it("recusa o nome de outra categoria com 409 CATEGORY_NAME_TAKEN", async () => {
      const admin = await signIn("admin", adminProfileId);
      await newCategory(admin, "Suplementos");
      const other = await newCategory(admin, "Acessórios");

      const response = await api(admin).rename(other.id, { name: "Suplementos" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CATEGORY_NAME_TAKEN");
    });

    it("categoria inexistente: 404 NOT_FOUND", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).rename("nao-existe", { name: "Qualquer" });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: "NOT_FOUND",
        message: "Categoria não encontrada.",
      });
    });
  });

  describe("Ordenar", () => {
    it("reescreve as posições com a lista completa e devolve a nova ordem", async () => {
      const admin = await signIn("admin", adminProfileId);
      const first = await newCategory(admin, "Suplementos");
      const second = await newCategory(admin, "Acessórios");
      const third = await newCategory(admin, "Vestuário");

      const response = await api(admin).reorder([third.id, first.id, second.id]);

      expect(response.status).toBe(200);
      expect(response.body.map((category: { name: string }) => category.name)).toEqual([
        "Vestuário",
        "Suplementos",
        "Acessórios",
      ]);
      expect(response.body.map((category: { position: number }) => category.position)).toEqual([
        1, 2, 3,
      ]);
      const stored = await testPrisma.shopCategory.findMany({ orderBy: { position: "asc" } });
      expect(stored.map((category) => category.name)).toEqual([
        "Vestuário",
        "Suplementos",
        "Acessórios",
      ]);
    });

    it("lista com id faltando, sobrando ou repetido: 400 e a ordem não muda", async () => {
      const admin = await signIn("admin", adminProfileId);
      const first = await newCategory(admin, "Suplementos");
      const second = await newCategory(admin, "Acessórios");
      const before = await testPrisma.shopCategory.findMany({ orderBy: { position: "asc" } });

      const missing = await api(admin).reorder([first.id]);
      const extra = await api(admin).reorder([first.id, second.id, "fantasma"]);
      const repeated = await api(admin).reorder([first.id, first.id]);

      for (const response of [missing, extra, repeated]) {
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("VALIDATION_ERROR");
      }
      const after = await testPrisma.shopCategory.findMany({ orderBy: { position: "asc" } });
      expect(after).toEqual(before);
    });
  });

  describe("Excluir", () => {
    it("exclui categoria sem produtos com 204", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");

      const response = await api(admin).remove(category.id);

      expect(response.status).toBe(204);
      expect((await api(admin).list()).body).toEqual([]);
    });

    it("categoria com produto não excluído: 409 CATEGORY_IN_USE e a categoria permanece", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      await productIn(category.id);

      const response = await api(admin).remove(category.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CATEGORY_IN_USE");
      expect(await testPrisma.shopCategory.findUnique({ where: { id: category.id } })).not.toBeNull();
    });

    it("com produto só excluído logicamente: 204, e o produto perde a categoria", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      const product = await productIn(category.id, { excluidoEm: new Date() });

      const response = await api(admin).remove(category.id);

      expect(response.status).toBe(204);
      const stored = await testPrisma.product.findUnique({ where: { id: product.id } });
      expect(stored).not.toBeNull();
      expect(stored?.categoryId).toBeNull();
      expect(stored?.excluidoEm).not.toBeNull();
    });

    it("categoria inexistente: 404 NOT_FOUND", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).remove("nao-existe");

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    });
  });

  describe("Contagem de produtos", () => {
    it("productCount conta só produtos não excluídos", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await newCategory(admin, "Suplementos");
      await productIn(category.id);
      await productIn(category.id);
      await productIn(category.id, { excluidoEm: new Date() });

      const response = await api(admin).list();

      expect(response.body).toEqual([
        expect.objectContaining({ id: category.id, productCount: 2 }),
      ]);
    });
  });
});
