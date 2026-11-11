import type { INestApplication } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const BASE = "/api/shop/admin/products";

type Action = "VIEW" | "CREATE" | "EDIT" | "DELETE";

describe("Loja: produtos no admin (HTTP)", () => {
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

  async function signIn(name: string, profileId: string): Promise<string> {
    const user = await createUser({
      email: `${name}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName: name,
    });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  /** Equipe com a permissão LOJA nas ações dadas (vazio = sem acesso ao módulo). */
  async function teamWith(name: string, actions: Action[], scope: "ALL" | "OWN" = "ALL") {
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
      list: (query = "") => http().get(`${BASE}${query}`).set(auth),
      get: (id: string) => http().get(`${BASE}/${id}`).set(auth),
      create: (body: unknown) => http().post(BASE).set(auth).send(body as object),
      update: (id: string, body: unknown) =>
        http().patch(`${BASE}/${id}`).set(auth).send(body as object),
      remove: (id: string) => http().delete(`${BASE}/${id}`).set(auth),
    };
  }

  const productBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Whey Protein",
    priceCents: 15_000,
    stock: 10,
    ...overrides,
  });

  async function newProduct(token: string, overrides: Record<string, unknown> = {}) {
    const response = await api(token).create(productBody(overrides));
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  function categoryRow(name: string) {
    return testPrisma.shopCategory.create({ data: { name, position: 1 } });
  }

  function variantsOf(productId: string) {
    return testPrisma.productVariant.findMany({ where: { productId } });
  }

  describe("Permissões", () => {
    it("sem o módulo LOJA, equipe e cliente recebem 403 em todas as rotas", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      const noAccess = await teamWith("sem-acesso", []);
      const client = await signIn("cliente", clientProfileId);

      for (const token of [noAccess, client]) {
        const responses = [
          await api(token).list(),
          await api(token).get(product.id),
          await api(token).create(productBody()),
          await api(token).update(product.id, { name: "Outro" }),
          await api(token).remove(product.id),
        ];
        for (const response of responses) {
          expect(response.status).toBe(403);
          expect(response.body.code).toBe("FORBIDDEN");
        }
      }
    });

    it("só Ver lê; criar, editar e excluir pedem a ação própria", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      const viewer = await teamWith("so-ver", ["VIEW"]);

      expect((await api(viewer).list()).status).toBe(200);
      expect((await api(viewer).get(product.id)).status).toBe(200);
      expect((await api(viewer).create(productBody())).status).toBe(403);
      expect((await api(viewer).update(product.id, { name: "Outro" })).status).toBe(403);
      expect((await api(viewer).remove(product.id)).status).toBe(403);
    });

    it("com Ver e Criar, cria mas não edita nem exclui", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      const creator = await teamWith("criador", ["VIEW", "CREATE"]);

      expect((await api(creator).create(productBody({ name: "Creatina" }))).status).toBe(201);
      expect((await api(creator).update(product.id, { name: "Outro" })).status).toBe(403);
      expect((await api(creator).remove(product.id)).status).toBe(403);
    });

    it("com Ver e Editar, edita mas não cria nem exclui", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      const editor = await teamWith("editor", ["VIEW", "EDIT"]);

      expect((await api(editor).update(product.id, { name: "Outro" })).status).toBe(200);
      expect((await api(editor).create(productBody())).status).toBe(403);
      expect((await api(editor).remove(product.id)).status).toBe(403);
    });

    it("com Ver e Excluir, exclui mas não edita", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      const remover = await teamWith("removedor", ["VIEW", "DELETE"]);

      expect((await api(remover).update(product.id, { name: "Outro" })).status).toBe(403);
      expect((await api(remover).remove(product.id)).status).toBe(204);
    });

    it("escopo que não é total recebe 403 OUT_OF_SCOPE em todas as rotas, mesmo com todas as ações", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      const restricted = await teamWith("escopo-proprio", ["VIEW", "CREATE", "EDIT", "DELETE"], "OWN");

      const responses = [
        await api(restricted).list(),
        await api(restricted).get(product.id),
        await api(restricted).create(productBody()),
        await api(restricted).update(product.id, { name: "Outro" }),
        await api(restricted).remove(product.id),
      ];
      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("OUT_OF_SCOPE");
      }
      expect(await testPrisma.product.count({ where: { name: "Outro" } })).toBe(0);
    });
  });

  describe("Criação", () => {
    it("cria o produto e a variação única com o estoque, e devolve o resumo", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await categoryRow("Suplementos");

      const response = await api(admin).create(
        productBody({
          description: "Sabor chocolate",
          categoryId: category.id,
          promoPriceCents: 12_000,
          permiteMaisDeUmaUnidade: true,
          limitePorPedido: 3,
          stock: 7,
        }),
      );

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        name: "Whey Protein",
        description: "Sabor chocolate",
        category: { id: category.id, name: "Suplementos" },
        priceCents: 15_000,
        promoPriceCents: 12_000,
        visivel: true,
        destaque: false,
        permiteMaisDeUmaUnidade: true,
        limitePorPedido: 3,
        variantCount: 1,
        stock: 7,
        soldOutVariantCount: 0,
        createdAt: expect.any(String),
      });
      expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
      const variants = await variantsOf(response.body.id);
      expect(variants).toHaveLength(1);
      expect(variants[0]).toMatchObject({ label: null, stock: 7, ativa: true });
    });

    it("produto com estoque zero conta uma variação esgotada", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).create(productBody({ stock: 0 }));

      expect(response.body).toMatchObject({ stock: 0, soldOutVariantCount: 1, category: null });
    });

    it("recusa promoção igual ou maior que o preço com 400", async () => {
      const admin = await signIn("admin", adminProfileId);

      const equal = await api(admin).create(productBody({ promoPriceCents: 15_000 }));
      const higher = await api(admin).create(productBody({ promoPriceCents: 16_000 }));

      expect(equal.status).toBe(400);
      expect(higher.status).toBe(400);
      expect(equal.body.code).toBe("VALIDATION_ERROR");
      expect(await testPrisma.product.count()).toBe(0);
    });

    it("recusa limite por pedido sem permitir mais de uma unidade, com 400", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).create(productBody({ limitePorPedido: 2 }));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("recusa preço negativo, preço fracionado e estoque negativo com 400", async () => {
      const admin = await signIn("admin", adminProfileId);

      const negative = await api(admin).create(productBody({ priceCents: -1 }));
      const fractional = await api(admin).create(productBody({ priceCents: 129.5 }));
      const negativeStock = await api(admin).create(productBody({ stock: -2 }));

      expect(negative.status).toBe(400);
      expect(fractional.status).toBe(400);
      expect(negativeStock.status).toBe(400);
    });

    it("categoria inexistente: 404 NOT_FOUND e nada é gravado", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).create(productBody({ categoryId: "nao-existe" }));

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: "NOT_FOUND",
        message: "Categoria não encontrada.",
      });
      expect(await testPrisma.product.count()).toBe(0);
    });
  });

  describe("Listagem e consulta", () => {
    it("lista do mais recente para o mais antigo, com filtro de nome sem diferenciar maiúsculas", async () => {
      const admin = await signIn("admin", adminProfileId);
      await newProduct(admin, { name: "Whey Protein" });
      await newProduct(admin, { name: "Creatina Monohidratada" });
      await newProduct(admin, { name: "Barra de proteína" });

      const all = await api(admin).list();
      const byName = await api(admin).list("?q=PROTEÍNA");
      const byWhey = await api(admin).list("?q=whey");

      expect(all.body.map((product: { name: string }) => product.name)).toEqual([
        "Barra de proteína",
        "Creatina Monohidratada",
        "Whey Protein",
      ]);
      expect(byName.body.map((product: { name: string }) => product.name)).toEqual([
        "Barra de proteína",
      ]);
      expect(byWhey.body).toHaveLength(1);
    });

    it("filtra por categoria e por visibilidade (todos, visíveis, ocultos)", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await categoryRow("Suplementos");
      await newProduct(admin, { name: "Whey", categoryId: category.id });
      await newProduct(admin, { name: "Camiseta" });
      await newProduct(admin, { name: "Creatina", visivel: false });

      const byCategory = await api(admin).list(`?categoryId=${category.id}`);
      const visible = await api(admin).list("?visibility=visible");
      const hidden = await api(admin).list("?visibility=hidden");
      const everything = await api(admin).list("?visibility=all");

      expect(byCategory.body.map((product: { name: string }) => product.name)).toEqual(["Whey"]);
      expect(visible.body.map((product: { name: string }) => product.name).sort()).toEqual([
        "Camiseta",
        "Whey",
      ]);
      expect(hidden.body.map((product: { name: string }) => product.name)).toEqual(["Creatina"]);
      expect(everything.body).toHaveLength(3);
    });

    it("produto oculto aparece para quem tem Ver, na consulta e na lista", async () => {
      const admin = await signIn("admin", adminProfileId);
      const hidden = await newProduct(admin, { visivel: false });
      const viewer = await teamWith("ver-ocultos", ["VIEW"]);

      const listed = await api(viewer).list();
      const single = await api(viewer).get(hidden.id);

      expect(listed.body).toEqual([expect.objectContaining({ id: hidden.id, visivel: false })]);
      expect(single.body).toMatchObject({ id: hidden.id, visivel: false });
    });
  });

  describe("Atualização", () => {
    it("altera preço, estoque e categoria, e limpa a categoria com null", async () => {
      const admin = await signIn("admin", adminProfileId);
      const category = await categoryRow("Suplementos");
      const product = await newProduct(admin);

      const priced = await api(admin).update(product.id, { priceCents: 18_000, stock: 2 });
      const categorized = await api(admin).update(product.id, { categoryId: category.id });
      const cleared = await api(admin).update(product.id, { categoryId: null });

      expect(priced.body).toMatchObject({ priceCents: 18_000, stock: 2, soldOutVariantCount: 0 });
      expect(categorized.body.category).toEqual({ id: category.id, name: "Suplementos" });
      expect(cleared.body.category).toBeNull();
      const variants = await variantsOf(product.id);
      expect(variants).toHaveLength(1);
      expect(variants[0].stock).toBe(2);
    });

    it("estoque zero conta a variação como esgotada; voltar ao estoque tira o esgotado", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);

      const soldOut = await api(admin).update(product.id, { stock: 0 });
      const restocked = await api(admin).update(product.id, { stock: 4 });

      expect(soldOut.body).toMatchObject({ stock: 0, soldOutVariantCount: 1 });
      expect(restocked.body).toMatchObject({ stock: 4, soldOutVariantCount: 0 });
    });

    it("oculta e mostra o produto", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);

      const hidden = await api(admin).update(product.id, { visivel: false });
      const shown = await api(admin).update(product.id, { visivel: true });

      expect(hidden.body.visivel).toBe(false);
      expect(shown.body.visivel).toBe(true);
    });

    it("limpa a promoção e a descrição com null", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, {
        description: "Sabor baunilha",
        promoPriceCents: 12_000,
      });

      const response = await api(admin).update(product.id, {
        promoPriceCents: null,
        description: null,
      });

      expect(response.body).toMatchObject({ promoPriceCents: null, description: null });
    });

    it("usa o preço salvo para validar a promoção: baixar o preço abaixo da promoção é recusado", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, { promoPriceCents: 12_000 });

      const response = await api(admin).update(product.id, { priceCents: 11_000 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      const stored = await testPrisma.product.findUnique({ where: { id: product.id } });
      expect(stored?.priceCents).toBe(15_000);
    });

    it("usa a promoção salva para validar o preço: promoção nova acima do preço salvo é recusada", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);

      const response = await api(admin).update(product.id, { promoPriceCents: 15_000 });

      expect(response.status).toBe(400);
    });

    it("desligar permite mais de uma unidade sem mandar limite zera o limite", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, {
        permiteMaisDeUmaUnidade: true,
        limitePorPedido: 5,
      });

      const response = await api(admin).update(product.id, { permiteMaisDeUmaUnidade: false });

      expect(response.body).toMatchObject({
        permiteMaisDeUmaUnidade: false,
        limitePorPedido: null,
      });
      const stored = await testPrisma.product.findUnique({ where: { id: product.id } });
      expect(stored?.limitePorPedido).toBeNull();
    });

    it("limite por pedido com permite mais de uma unidade desligado (no estado salvo ou no corpo) é recusado", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);

      const fromBody = await api(admin).update(product.id, {
        permiteMaisDeUmaUnidade: false,
        limitePorPedido: 3,
      });
      const fromStored = await api(admin).update(product.id, { limitePorPedido: 3 });

      expect(fromBody.status).toBe(400);
      expect(fromStored.status).toBe(400);
    });

    it("produto inexistente, excluído ou categoria inexistente: 404", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      await api(admin).remove(product.id);

      const missing = await api(admin).update("nao-existe", { name: "Outro" });
      const deleted = await api(admin).update(product.id, { name: "Outro" });
      const live = await newProduct(admin, { name: "Ativo" });
      const badCategory = await api(admin).update(live.id, { categoryId: "nao-existe" });

      expect(missing.status).toBe(404);
      expect(deleted.status).toBe(404);
      expect(badCategory.status).toBe(404);
      expect(badCategory.body.message).toBe("Categoria não encontrada.");
    });
  });

  describe("Destaque no Início (máximo de 3)", () => {
    it("o quarto produto em destaque é recusado com 409 FEATURED_LIMIT_REACHED", async () => {
      const admin = await signIn("admin", adminProfileId);
      for (let index = 0; index < 3; index += 1) {
        await newProduct(admin, { name: `Destaque ${index}`, destaque: true });
      }

      const response = await api(admin).create(productBody({ name: "Quarto", destaque: true }));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "FEATURED_LIMIT_REACHED",
        message:
          "Você já tem 3 produtos em destaque no Início. Desmarque um antes de destacar outro.",
      });
      expect(await testPrisma.product.count({ where: { destaque: true } })).toBe(3);
    });

    it("desmarcar um destaque libera a vaga para outro", async () => {
      const admin = await signIn("admin", adminProfileId);
      const first = await newProduct(admin, { name: "Um", destaque: true });
      await newProduct(admin, { name: "Dois", destaque: true });
      await newProduct(admin, { name: "Três", destaque: true });
      const fourth = await newProduct(admin, { name: "Quatro" });

      const unmarked = await api(admin).update(first.id, { destaque: false });
      const marked = await api(admin).update(fourth.id, { destaque: true });

      expect(unmarked.body.destaque).toBe(false);
      expect(marked.status).toBe(200);
      expect(marked.body.destaque).toBe(true);
    });

    it("excluir um produto em destaque libera a vaga", async () => {
      const admin = await signIn("admin", adminProfileId);
      const first = await newProduct(admin, { name: "Um", destaque: true });
      await newProduct(admin, { name: "Dois", destaque: true });
      await newProduct(admin, { name: "Três", destaque: true });
      const fourth = await newProduct(admin, { name: "Quatro" });

      await api(admin).remove(first.id);
      const marked = await api(admin).update(fourth.id, { destaque: true });

      expect(marked.status).toBe(200);
    });

    it("reafirmar o destaque de quem já está em destaque não conta de novo", async () => {
      const admin = await signIn("admin", adminProfileId);
      const first = await newProduct(admin, { name: "Um", destaque: true });
      await newProduct(admin, { name: "Dois", destaque: true });
      await newProduct(admin, { name: "Três", destaque: true });

      const reaffirmed = await api(admin).update(first.id, { destaque: true, name: "Um editado" });

      expect(reaffirmed.status).toBe(200);
      expect(reaffirmed.body).toMatchObject({ name: "Um editado", destaque: true });
      expect(await testPrisma.product.count({ where: { destaque: true } })).toBe(3);
    });

    it("quatro marcações simultâneas deixam no máximo 3 destaques no banco", async () => {
      const admin = await signIn("admin", adminProfileId);

      const responses = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          api(admin).create(productBody({ name: `Corrida ${index}`, destaque: true })),
        ),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([201, 201, 201, 409]);
      expect(
        await testPrisma.product.count({ where: { destaque: true, excluidoEm: null } }),
      ).toBe(3);
    });
  });

  describe("Exclusão lógica", () => {
    it("some da lista e da consulta, mas a linha e a variação continuam no banco", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, { destaque: true });

      const removed = await api(admin).remove(product.id);

      expect(removed.status).toBe(204);
      expect((await api(admin).list()).body).toEqual([]);
      expect((await api(admin).get(product.id)).status).toBe(404);
      const stored = await testPrisma.product.findUnique({ where: { id: product.id } });
      expect(stored).not.toBeNull();
      expect(stored?.excluidoEm).not.toBeNull();
      expect(stored?.destaque).toBe(false);
      expect(await variantsOf(product.id)).toHaveLength(1);
    });

    it("excluir de novo é 404", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin);
      await api(admin).remove(product.id);

      const again = await api(admin).remove(product.id);

      expect(again.status).toBe(404);
      expect(again.body.code).toBe("NOT_FOUND");
    });

    it("produto inexistente: 404", async () => {
      const admin = await signIn("admin", adminProfileId);

      expect((await api(admin).remove("nao-existe")).status).toBe(404);
    });
  });

  describe("Concorrência por produto", () => {
    /**
     * Abre uma transação do teste que faz `write` (segurando a linha afetada),
     * dispara a requisição com `start` e só confirma depois que ela já está
     * presa no lock. Assim a intercalação é a mesma em toda execução.
     */
    async function commitWhileRequestWaits(
      write: (tx: Prisma.TransactionClient) => Promise<unknown>,
      start: () => PromiseLike<request.Response>,
    ): Promise<request.Response> {
      let pending: Promise<request.Response> | undefined;
      await testPrisma.$transaction(
        async (tx) => {
          await write(tx);
          pending = Promise.resolve(start());
          await waitForLockWaiter();
        },
        { timeout: 15_000 },
      );
      if (!pending) throw new Error("A requisição não foi disparada.");
      return pending;
    }

    /** Espera até alguma sessão do banco estar bloqueada num lock: a requisição chegou ao travamento. */
    async function waitForLockWaiter(): Promise<void> {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const [row] = await testPrisma.$queryRaw<Array<{ waiting: bigint }>>`
          SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
        if (Number(row.waiting) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Nenhuma requisição ficou esperando o lock da linha.");
    }

    function featuredCount() {
      return testPrisma.product.count({ where: { destaque: true, excluidoEm: null } });
    }

    it("PATCH de destaque que chega durante outra mudança de destaque não passa de 3", async () => {
      const admin = await signIn("admin", adminProfileId);
      const a = await newProduct(admin, { name: "A", destaque: true });
      await newProduct(admin, { name: "B", destaque: true });
      await newProduct(admin, { name: "C", destaque: true });
      const d = await newProduct(admin, { name: "D" });

      // Outra requisição desmarca A e destaca D antes de o PATCH de A gravar.
      const response = await commitWhileRequestWaits(
        async (tx) => {
          await tx.product.update({ where: { id: a.id }, data: { destaque: false } });
          await tx.product.update({ where: { id: d.id }, data: { destaque: true } });
        },
        () => api(admin).update(a.id, { destaque: true, name: "A editado" }),
      );

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("FEATURED_LIMIT_REACHED");
      expect(await featuredCount()).toBe(3);
      expect(await testPrisma.product.findUnique({ where: { id: a.id } })).toMatchObject({
        destaque: false,
        name: "A",
      });
    });

    it("PATCHs simultâneos de destaque nunca deixam mais de 3 produtos destacados (20 rodadas)", async () => {
      const admin = await signIn("admin", adminProfileId);
      const a = await newProduct(admin, { name: "A", destaque: true });
      const b = await newProduct(admin, { name: "B", destaque: true });
      const c = await newProduct(admin, { name: "C", destaque: true });
      const d = await newProduct(admin, { name: "D" });

      for (let round = 0; round < 20; round += 1) {
        await testPrisma.product.updateMany({
          where: { id: { in: [a.id, b.id, c.id] } },
          data: { destaque: true },
        });
        await testPrisma.product.update({ where: { id: d.id }, data: { destaque: false } });

        const responses = await Promise.all([
          api(admin).update(a.id, { destaque: true, name: `A ${round}` }),
          api(admin).update(a.id, { destaque: false }),
          api(admin).update(d.id, { destaque: true }),
        ]);

        for (const response of responses) expect([200, 409]).toContain(response.status);
        expect(await featuredCount()).toBeLessThanOrEqual(3);
      }
    });

    it("PATCH que oculta não regrava o preço antigo quando outro PATCH mudou o preço", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, { priceCents: 15_000 });

      const response = await commitWhileRequestWaits(
        (tx) => tx.product.update({ where: { id: product.id }, data: { priceCents: 18_000 } }),
        () => api(admin).update(product.id, { visivel: false }),
      );

      expect(response.status).toBe(200);
      expect(await testPrisma.product.findUnique({ where: { id: product.id } })).toMatchObject({
        priceCents: 18_000,
        visivel: false,
      });
    });

    it("PATCH de estoque não regrava a promoção antiga quando outro PATCH a mudou", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, { priceCents: 15_000, stock: 10 });

      const response = await commitWhileRequestWaits(
        (tx) => tx.product.update({ where: { id: product.id }, data: { promoPriceCents: 12_000 } }),
        () => api(admin).update(product.id, { stock: 4 }),
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ stock: 4, promoPriceCents: 12_000 });
      expect(await testPrisma.product.findUnique({ where: { id: product.id } })).toMatchObject({
        promoPriceCents: 12_000,
      });
    });

    it("PATCHs simultâneos em campos distintos preservam os dois (repetido em paralelo)", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, { priceCents: 15_000, stock: 10 });

      for (let round = 0; round < 8; round += 1) {
        await testPrisma.product.update({
          where: { id: product.id },
          data: { priceCents: 15_000, visivel: true, promoPriceCents: null },
        });
        const [price, hide] = await Promise.all([
          api(admin).update(product.id, { priceCents: 18_000 }),
          api(admin).update(product.id, { visivel: false }),
        ]);
        expect([price.status, hide.status]).toEqual([200, 200]);
        expect(await testPrisma.product.findUnique({ where: { id: product.id } })).toMatchObject({
          priceCents: 18_000,
          visivel: false,
        });

        await testPrisma.product.update({
          where: { id: product.id },
          data: { priceCents: 15_000, promoPriceCents: null },
        });
        const [stock, promo] = await Promise.all([
          api(admin).update(product.id, { stock: round + 1 }),
          api(admin).update(product.id, { promoPriceCents: 12_000 }),
        ]);
        expect([stock.status, promo.status]).toEqual([200, 200]);
        expect(await testPrisma.product.findUnique({ where: { id: product.id } })).toMatchObject({
          priceCents: 15_000,
          promoPriceCents: 12_000,
        });
        const variants = await variantsOf(product.id);
        expect(variants.filter((variant) => variant.ativa)[0]?.stock).toBe(round + 1);
      }
    });

    it("PATCH de produto que está sendo excluído não o ressuscita", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProduct(admin, { name: "Antigo" });

      // A exclusão (mesma escrita do DELETE) fica em andamento; o PATCH espera e depois vê o produto excluído.
      const response = await commitWhileRequestWaits(
        (tx) =>
          tx.product.update({
            where: { id: product.id },
            data: { excluidoEm: new Date(), destaque: false },
          }),
        () => api(admin).update(product.id, { name: "Ressuscitado" }),
      );

      expect(response.status).toBe(404);
      const stored = await testPrisma.product.findUnique({ where: { id: product.id } });
      expect(stored?.excluidoEm).not.toBeNull();
      expect(stored?.name).toBe("Antigo");
    });

    it("DELETE e PATCH simultâneos terminam com o produto excluído, em 404 ou em gravação anterior", async () => {
      const admin = await signIn("admin", adminProfileId);

      for (let round = 0; round < 10; round += 1) {
        const product = await newProduct(admin, { name: `Corrida ${round}` });
        const [removed, patched] = await Promise.all([
          api(admin).remove(product.id),
          api(admin).update(product.id, { name: `Editado ${round}` }),
        ]);

        expect(removed.status).toBe(204);
        expect([200, 404]).toContain(patched.status);
        const stored = await testPrisma.product.findUnique({ where: { id: product.id } });
        expect(stored?.excluidoEm).not.toBeNull();
      }
    });
  });
});
