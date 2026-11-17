import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const ADMIN_PRODUCTS = "/api/shop/admin/products";
const CLIENT_CATALOG = "/api/shop/products";
const IMAGE_BYTES = Buffer.from("imagem-ficticia-webp");

describe("Loja: catálogo do cliente (HTTP)", () => {
  let app: INestApplication;
  let admin: string;
  let client: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    await grantModuleAccess({
      profileId: adminProfile.id,
      module: "LOJA",
      actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
      scope: "ALL",
    });
    admin = await signIn("admin", adminProfile.id);
    client = await signIn("cliente", clientProfile.id);
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

  async function createProduct(overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post(ADMIN_PRODUCTS)
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Camiseta Fitburn", priceCents: 5000, stock: 8, ...overrides });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string };
  }

  async function uploadImage(productId: string) {
    return request(app.getHttpServer())
      .post(`${ADMIN_PRODUCTS}/${productId}/images`)
      .set("Authorization", `Bearer ${admin}`)
      .field("mimeType", "image/webp")
      .field("sizeBytes", String(IMAGE_BYTES.length))
      .attach("file", IMAGE_BYTES, { filename: "produto.webp", contentType: "image/webp" });
  }

  it("lista somente produtos vendáveis e informa preço mínimo e disponibilidade sem estoque exato", async () => {
    const visible = await createProduct({
      priceCents: 5000,
      promoPriceCents: 4200,
      options: [{ name: "Tamanho", values: ["P", "M"] }],
      stock: 0,
      variants: [
        { combination: ["P"], stock: 7, priceCents: 4500 },
        { combination: ["M"], stock: 0 },
      ],
    });
    const hidden = await createProduct({ name: "Oculta", visivel: false });
    const excluded = await createProduct({ name: "Excluída" });
    await request(app.getHttpServer())
      .delete(`${ADMIN_PRODUCTS}/${excluded.id}`)
      .set("Authorization", `Bearer ${admin}`);
    const noActiveVariant = await createProduct({
      name: "Sem variação ativa",
      options: [{ name: "Cor", values: ["Preta"] }],
      stock: 0,
      variants: [{ combination: ["Preta"], stock: 9, ativa: false }],
    });
    const fewUnits = await createProduct({ name: "Poucas unidades", stock: 3 });
    const soldOut = await createProduct({ name: "Esgotada", stock: 0 });

    const response = await request(app.getHttpServer())
      .get(CLIENT_CATALOG)
      .set("Authorization", `Bearer ${client}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body.find((item: { id: string }) => item.id === visible.id)).toMatchObject({
      id: visible.id,
      startingPriceCents: 4200,
      originalPriceCents: 4500,
      hasPriceVariation: true,
      availability: "DISPONIVEL",
    });
    expect(response.body.find((item: { id: string }) => item.id === fewUnits.id).availability).toBe(
      "POUCAS_UNIDADES",
    );
    expect(response.body.find((item: { id: string }) => item.id === soldOut.id).availability).toBe(
      "ESGOTADO",
    );
    for (const item of response.body) {
      expect(item).not.toHaveProperty("stock");
      expect(item).not.toHaveProperty("variants");
    }
    for (const id of [hidden.id, excluded.id, noActiveVariant.id]) {
      expect(
        (
          await request(app.getHttpServer())
            .get(`${CLIENT_CATALOG}/${id}`)
            .set("Authorization", `Bearer ${client}`)
        ).status,
      ).toBe(404);
    }
  });

  it("detalha fotos, opções e disponibilidade por combinação sem divulgar estoque exato", async () => {
    const product = await createProduct({
      name: "Garrafa esportiva",
      options: [{ name: "Cor", values: ["Azul", "Preta", "Branca"] }],
      stock: 0,
      variants: [
        { combination: ["Azul"], stock: 1 },
        { combination: ["Preta"], stock: 0 },
        { combination: ["Branca"], stock: 12 },
      ],
    });
    const image = await uploadImage(product.id);
    expect(image.status, JSON.stringify(image.body)).toBe(201);

    const response = await request(app.getHttpServer())
      .get(`${CLIENT_CATALOG}/${product.id}`)
      .set("Authorization", `Bearer ${client}`);

    expect(response.status).toBe(200);
    expect(response.body.options).toEqual([
      {
        id: expect.any(String),
        name: "Cor",
        values: [
          { id: expect.any(String), value: "Azul" },
          { id: expect.any(String), value: "Preta" },
          { id: expect.any(String), value: "Branca" },
        ],
      },
    ]);
    expect(response.body.images).toMatchObject([
      { id: image.body.id, url: `/api/shop/product-images/${image.body.id}`, isCover: true },
    ]);
    const imageContent = await request(app.getHttpServer())
      .get(`/api/shop/product-images/${image.body.id}`)
      .set("Authorization", `Bearer ${client}`);
    expect(imageContent.status).toBe(200);
    expect(imageContent.body).toEqual(IMAGE_BYTES);
    expect(
      response.body.variants.map((variant: { values: string[]; availability: string }) => [
        variant.values[0],
        variant.availability,
      ]),
    ).toEqual([
      ["Azul", "POUCAS_UNIDADES"],
      ["Preta", "ESGOTADO"],
      ["Branca", "DISPONIVEL"],
    ]);
    expect(response.body).not.toHaveProperty("stock");
    for (const variant of response.body.variants) {
      expect(variant).not.toHaveProperty("stock");
      expect(variant).not.toHaveProperty("priceCents");
    }
  });

  it("filtra por categoria e lista somente categorias com produto vendável", async () => {
    const supplements = await request(app.getHttpServer())
      .post("/api/shop/admin/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Suplementos" });
    const apparel = await request(app.getHttpServer())
      .post("/api/shop/admin/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Vestuário" });
    await createProduct({ name: "Creatina", categoryId: supplements.body.id });
    await createProduct({ name: "Camiseta", categoryId: apparel.body.id, visivel: false });

    const categories = await request(app.getHttpServer())
      .get("/api/shop/categories")
      .set("Authorization", `Bearer ${client}`);
    const filtered = await request(app.getHttpServer())
      .get(`${CLIENT_CATALOG}?categoryId=${supplements.body.id}`)
      .set("Authorization", `Bearer ${client}`);
    const empty = await request(app.getHttpServer())
      .get(`${CLIENT_CATALOG}?categoryId=${apparel.body.id}`)
      .set("Authorization", `Bearer ${client}`);

    expect(categories.body).toEqual([
      { id: supplements.body.id, name: "Suplementos", position: 1 },
    ]);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].category.id).toBe(supplements.body.id);
    expect(empty.body).toEqual([]);
  });

  it("destaques retorna produtos marcados e ignora os ocultos", async () => {
    const featured = await createProduct({ name: "Destaque", destaque: true });
    await createProduct({ name: "Normal" });
    await createProduct({ name: "Destaque oculto", destaque: true, visivel: false });

    const response = await request(app.getHttpServer())
      .get("/api/shop/featured")
      .set("Authorization", `Bearer ${client}`);

    expect(response.status).toBe(200);
    expect(response.body.map((product: { id: string }) => product.id)).toEqual([featured.id]);
  });

  it("sem destaques marcados, usa até três produtos vendáveis mais recentes", async () => {
    await createProduct({ name: "Mais antigo" });
    await createProduct({ name: "Produto recente 1" });
    await createProduct({ name: "Produto recente 2" });
    await createProduct({ name: "Produto recente 3" });
    await createProduct({ name: "Produto oculto", visivel: false });

    const response = await request(app.getHttpServer())
      .get("/api/shop/featured")
      .set("Authorization", `Bearer ${client}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body.map((product: { name: string }) => product.name)).not.toContain(
      "Produto oculto",
    );
    expect(response.body.map((product: { name: string }) => product.name)).not.toContain(
      "Mais antigo",
    );
  });

  it("cliente lê sem LOJA, mas não acessa rotas de escrita administrativa e exige login", async () => {
    const product = await createProduct();
    const noToken = await request(app.getHttpServer()).get(CLIENT_CATALOG);
    const read = await request(app.getHttpServer())
      .get(CLIENT_CATALOG)
      .set("Authorization", `Bearer ${client}`);
    const adminWrite = await request(app.getHttpServer())
      .patch(`${ADMIN_PRODUCTS}/${product.id}`)
      .set("Authorization", `Bearer ${client}`)
      .send({ name: "Alterada pelo cliente" });

    expect(noToken.status).toBe(401);
    expect(read.status).toBe(200);
    expect(adminWrite.status).toBe(403);
  });
});
