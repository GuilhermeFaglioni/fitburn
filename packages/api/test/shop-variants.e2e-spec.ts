import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const BASE = "/api/shop/admin/products";

type Action = "VIEW" | "CREATE" | "EDIT" | "DELETE";
type Option = { name: string; values: string[] };

const COR: Option = { name: "Cor", values: ["Preta", "Branca"] };
const TAMANHO: Option = { name: "Tamanho", values: ["P", "M"] };
const MODELO: Option = { name: "Modelo", values: ["A", "B", "C"] };

describe("Loja: opções e variações no admin (HTTP)", () => {
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
      list: () => http().get(BASE).set(auth),
      get: (id: string) => http().get(`${BASE}/${id}`).set(auth),
      create: (body: unknown) => http().post(BASE).set(auth).send(body as object),
      update: (id: string, body: unknown) =>
        http().patch(`${BASE}/${id}`).set(auth).send(body as object),
      setOptions: (id: string, body: unknown) =>
        http().put(`${BASE}/${id}/options`).set(auth).send(body as object),
      remove: (id: string) => http().delete(`${BASE}/${id}`).set(auth),
    };
  }

  const productBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Camiseta Fitburn",
    priceCents: 15_000,
    stock: 0,
    ...overrides,
  });

  async function newProductWithOptions(
    token: string,
    options: Option[],
    overrides: Record<string, unknown> = {},
  ) {
    const response = await api(token).create(productBody({ options, ...overrides }));
    expect(response.status).toBe(201);
    return response.body as { id: string; variantCount: number };
  }

  function variantRows(productId: string) {
    return testPrisma.productVariant.findMany({
      where: { productId },
      orderBy: { position: "asc" },
    });
  }

  describe("Geração do produto cartesiano", () => {
    it("uma opção: uma variação por valor, com rótulo do valor", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [{ name: "Tamanho", values: ["P", "M", "G"] }]);

      expect(product.variantCount).toBe(3);
      const detail = await api(admin).get(product.id);
      expect(detail.body.variants.map((variant: { label: string }) => variant.label)).toEqual(["P", "M", "G"]);
      expect(detail.body.variants[0].values).toEqual(["P"]);
    });

    it("duas e três opções: produto cartesiano na ordem das opções, rótulos com ' · '", async () => {
      const admin = await signIn("admin", adminProfileId);
      const two = await newProductWithOptions(admin, [COR, TAMANHO]);
      expect(two.variantCount).toBe(4);
      const twoDetail = await api(admin).get(two.id);
      expect(twoDetail.body.variants.map((variant: { label: string }) => variant.label)).toEqual([
        "Preta · P",
        "Preta · M",
        "Branca · P",
        "Branca · M",
      ]);

      const three = await newProductWithOptions(admin, [COR, TAMANHO, MODELO], { name: "Tênis" });
      expect(three.variantCount).toBe(12);
      const threeDetail = await api(admin).get(three.id);
      expect(threeDetail.body.variants).toHaveLength(12);
      expect(threeDetail.body.variants[0]).toMatchObject({
        label: "Preta · P · A",
        values: ["Preta", "P", "A"],
        stock: 0,
        priceCents: null,
        effectivePriceCents: 15_000,
        ativa: true,
      });
      expect(threeDetail.body.variants[11].label).toBe("Branca · M · C");
    });

    it("devolve as opções com nome e valores na ordem enviada", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR, TAMANHO]);

      const detail = await api(admin).get(product.id);

      expect(detail.body.options).toEqual([
        { id: expect.any(String), name: "Cor", values: [
          { id: expect.any(String), value: "Preta" },
          { id: expect.any(String), value: "Branca" },
        ] },
        { id: expect.any(String), name: "Tamanho", values: [
          { id: expect.any(String), value: "P" },
          { id: expect.any(String), value: "M" },
        ] },
      ]);
    });
  });

  describe("Limites e validação", () => {
    it("recusa mais de 3 opções, lista vazia de valores e mais de 20 valores", async () => {
      const admin = await signIn("admin", adminProfileId);
      const four = [COR, TAMANHO, MODELO, { name: "Extra", values: ["x"] }];
      expect((await api(admin).create(productBody({ options: four }))).status).toBe(400);
      expect(
        (await api(admin).create(productBody({ options: [{ name: "Cor", values: [] }] }))).status,
      ).toBe(400);
      const twentyOne = Array.from({ length: 21 }, (_, index) => `V${index}`);
      expect(
        (await api(admin).create(productBody({ options: [{ name: "Cor", values: twentyOne }] }))).status,
      ).toBe(400);
      expect(await testPrisma.product.count()).toBe(0);
    });

    it("aceita 20 valores e recusa nome de opção ou valor longo demais", async () => {
      const admin = await signIn("admin", adminProfileId);
      const twenty = Array.from({ length: 20 }, (_, index) => `V${index}`);
      const ok = await api(admin).create(productBody({ options: [{ name: "Cor", values: twenty }] }));
      expect(ok.status).toBe(201);
      expect(ok.body.variantCount).toBe(20);

      const longName = { name: "N".repeat(31), values: ["a"] };
      const longValue = { name: "Cor", values: ["v".repeat(41)] };
      expect((await api(admin).create(productBody({ options: [longName] }))).status).toBe(400);
      expect((await api(admin).create(productBody({ options: [longValue] }))).status).toBe(400);
    });

    it("recusa nome de opção repetido (sem diferença de maiúsculas) e valor repetido na opção", async () => {
      const admin = await signIn("admin", adminProfileId);
      const sameName = await api(admin).create(
        productBody({ options: [COR, { name: " cor ", values: ["x"] }] }),
      );
      expect(sameName.status).toBe(400);

      const sameValue = await api(admin).create(
        productBody({ options: [{ name: "Cor", values: ["Preta", " preta "] }] }),
      );
      expect(sameValue.status).toBe(400);
      expect(await testPrisma.product.count()).toBe(0);
    });

    it("recusa valor vazio", async () => {
      const admin = await signIn("admin", adminProfileId);
      const response = await api(admin).create(
        productBody({ options: [{ name: "Cor", values: ["   "] }] }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("Edição das opções (PUT)", () => {
    it("mantém estoque, preço próprio e ativa das combinações que continuam; nova nasce com estoque 0", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR, TAMANHO]);
      const keep = await api(admin).setOptions(product.id, {
        options: [COR, TAMANHO],
        variants: [
          { combination: ["Preta", "P"], stock: 7 },
          { combination: ["Branca", "M"], priceCents: 9_000 },
          { combination: ["Preta", "M"], ativa: false },
        ],
      });
      expect(keep.status).toBe(200);

      const edited = await api(admin).setOptions(product.id, {
        options: [COR, { name: "Tamanho", values: ["P", "G"] }],
      });

      expect(edited.status).toBe(200);
      const byLabel = Object.fromEntries(
        edited.body.variants.map((variant: { label: string }) => [variant.label, variant]),
      );
      expect(byLabel["Preta · P"]).toMatchObject({ stock: 7, priceCents: null, ativa: true });
      expect(byLabel["Preta · G"]).toMatchObject({ stock: 0, priceCents: null, ativa: true });
      expect(byLabel["Branca · P"]).toMatchObject({ stock: 0, ativa: true });
      expect(byLabel["Branca · G"]).toMatchObject({ stock: 0, ativa: true });
      expect(edited.body.variants).toHaveLength(4);
    });

    it("combinação que sai fica descontinuada e inativa, sem apagar; volta reaproveitada com o estoque e o preço", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR, TAMANHO]);
      await api(admin).setOptions(product.id, {
        options: [COR, TAMANHO],
        variants: [
          { combination: ["Branca", "M"], stock: 3, priceCents: 9_000 },
        ],
      });
      const before = await variantRows(product.id);
      const branca = before.find((row) => row.label === "Branca · M");

      await api(admin).setOptions(product.id, { options: [COR, { name: "Tamanho", values: ["P"] }] });
      const removed = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: branca!.id } });
      expect(removed).toMatchObject({ descontinuada: true, ativa: false, stock: 3, priceCents: 9_000 });

      const back = await api(admin).setOptions(product.id, { options: [COR, TAMANHO] });
      expect(back.status).toBe(200);
      expect(await testPrisma.productVariant.count({ where: { productId: product.id } })).toBe(4);
      const restored = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: branca!.id } });
      expect(restored).toMatchObject({ descontinuada: false, ativa: true, stock: 3, priceCents: 9_000 });
      expect(back.body.variants.find((variant: { label: string }) => variant.label === "Branca · M")).toMatchObject({
        stock: 3,
        priceCents: 9_000,
        effectivePriceCents: 9_000,
      });
    });

    it("variação descontinuada some do detalhe e da contagem da lista", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR, TAMANHO]);

      await api(admin).setOptions(product.id, { options: [COR] });

      const detail = await api(admin).get(product.id);
      expect(detail.body.variants.map((variant: { label: string }) => variant.label)).toEqual([
        "Preta",
        "Branca",
      ]);
      const listed = await api(admin).list();
      expect(listed.body[0].variantCount).toBe(2);
    });

    it("produto simples -> com opções -> sem opções mantém a variação única com o estoque", async () => {
      const admin = await signIn("admin", adminProfileId);
      const created = await api(admin).create(productBody({ stock: 6 }));
      const productId = created.body.id as string;

      const withOptions = await api(admin).setOptions(productId, { options: [COR] });
      expect(withOptions.status).toBe(200);
      expect(withOptions.body.variants.map((variant: { label: string }) => variant.label)).toEqual([
        "Preta",
        "Branca",
      ]);
      expect((await variantRows(productId)).find((row) => row.combinationKey === "")).toMatchObject({
        descontinuada: true,
        ativa: false,
        stock: 6,
      });

      const simple = await api(admin).setOptions(productId, { options: [] });
      expect(simple.status).toBe(200);
      expect(simple.body.options).toEqual([]);
      expect(simple.body.variants).toEqual([
        expect.objectContaining({ label: null, values: [], stock: 6, ativa: true }),
      ]);
      expect(await testPrisma.productVariant.count({ where: { productId, descontinuada: false } })).toBe(1);
    });

    it("preço efetivo: próprio > promocional > preço do produto", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR], { promoPriceCents: 12_000 });

      const response = await api(admin).setOptions(product.id, {
        options: [COR],
        variants: [{ combination: ["Preta"], priceCents: 9_900 }],
      });

      expect(response.body.variants).toEqual([
        expect.objectContaining({ label: "Preta", priceCents: 9_900, effectivePriceCents: 9_900 }),
        expect.objectContaining({ label: "Branca", priceCents: null, effectivePriceCents: 12_000 }),
      ]);
      const plain = await api(admin).get((await newProductWithOptions(admin, [TAMANHO], { name: "Meia" })).id);
      expect(plain.body.variants[0].effectivePriceCents).toBe(15_000);
    });

    it("sobreposição de combinação inexistente é 400 e nada muda", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR, TAMANHO]);

      const response = await api(admin).setOptions(product.id, {
        options: [COR, TAMANHO],
        variants: [{ combination: ["Verde", "P"], stock: 9 }],
      });

      expect(response.status).toBe(400);
      expect(await testPrisma.productVariant.count({ where: { productId: product.id } })).toBe(4);
    });

    it("sobreposição com combinação de tamanho errado é 400", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR, TAMANHO]);

      const response = await api(admin).setOptions(product.id, {
        options: [COR, TAMANHO],
        variants: [{ combination: ["Preta"], stock: 9 }],
      });

      expect(response.status).toBe(400);
    });

    it("gravações simultâneas das mesmas opções não duplicam variações", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);

      const responses = await Promise.all([
        api(admin).setOptions(product.id, { options: [COR, TAMANHO] }),
        api(admin).setOptions(product.id, { options: [COR, TAMANHO] }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const rows = await variantRows(product.id);
      expect(rows.filter((row) => !row.descontinuada)).toHaveLength(4);
      expect(new Set(rows.map((row) => row.combinationKey)).size).toBe(rows.length);
    });
  });

  describe("Estoque com opções", () => {
    it("PATCH com estoque em produto com opções devolve 400", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);

      const response = await api(admin).update(product.id, { stock: 5 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Defina o estoque por variação.");
    });

    it("PATCH sem estoque segue funcionando em produto com opções", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);

      const response = await api(admin).update(product.id, { name: "Nova camiseta" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Nova camiseta");
    });

    it("criação com opções exige estoque 0 e sobreposições com combinações existentes", async () => {
      const admin = await signIn("admin", adminProfileId);
      const withStock = await api(admin).create(productBody({ stock: 5, options: [COR] }));
      expect(withStock.status).toBe(400);

      const created = await api(admin).create(
        productBody({ stock: 0, options: [COR], variants: [{ combination: ["Branca"], stock: 4 }] }),
      );
      expect(created.status).toBe(201);
      const detail = await api(admin).get(created.body.id);
      expect(detail.body.variants.find((variant: { label: string }) => variant.label === "Branca")).toMatchObject({
        stock: 4,
      });
    });

    it("criação com sobreposição de combinação inexistente é 400 e não cria o produto (atômica)", async () => {
      const admin = await signIn("admin", adminProfileId);

      const response = await api(admin).create(
        productBody({ stock: 0, name: "Fantasma", options: [COR], variants: [{ combination: ["Verde"], stock: 4 }] }),
      );

      expect(response.status).toBe(400);
      expect(await testPrisma.product.count({ where: { name: "Fantasma" } })).toBe(0);
      expect(await testPrisma.productVariant.count()).toBe(0);
    });

    it("sobreposições na criação exigem opções", async () => {
      const admin = await signIn("admin", adminProfileId);
      const response = await api(admin).create(
        productBody({ stock: 3, variants: [{ combination: [], stock: 2 }] }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("Permissões e existência", () => {
    it("sem o módulo LOJA ou só com Ver, a gravação das opções é 403", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);
      const noAccess = await teamWith("sem-acesso", []);
      const viewer = await teamWith("so-ver", ["VIEW"]);
      const client = await signIn("cliente", clientProfileId);

      for (const token of [noAccess, viewer, client]) {
        const response = await api(token).setOptions(product.id, { options: [TAMANHO] });
        expect(response.status).toBe(403);
      }
      expect(await testPrisma.productOption.count({ where: { productId: product.id } })).toBe(1);
    });

    it("com Ver e Criar, cria mas não grava as opções de um produto existente", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);
      const creator = await teamWith("criador", ["VIEW", "CREATE"]);

      expect((await api(creator).setOptions(product.id, { options: [TAMANHO] })).status).toBe(403);
    });

    it("com Editar em escopo que não é total, recebe 403 OUT_OF_SCOPE", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);
      const restricted = await teamWith("escopo-proprio", ["VIEW", "EDIT"], "OWN");

      const response = await api(restricted).setOptions(product.id, { options: [TAMANHO] });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("OUT_OF_SCOPE");
    });

    it("com Editar e escopo total, grava", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);
      const editor = await teamWith("editor", ["VIEW", "EDIT"]);

      expect((await api(editor).setOptions(product.id, { options: [TAMANHO] })).status).toBe(200);
    });

    it("produto inexistente ou excluído é 404", async () => {
      const admin = await signIn("admin", adminProfileId);
      const product = await newProductWithOptions(admin, [COR]);
      const missing = await api(admin).setOptions("00000000-0000-4000-8000-000000000000", { options: [] });
      expect(missing.status).toBe(404);

      expect((await api(admin).remove(product.id)).status).toBe(204);
      const deleted = await api(admin).setOptions(product.id, { options: [] });
      expect(deleted.status).toBe(404);
      expect(deleted.body.code).toBe("NOT_FOUND");
    });
  });
});
