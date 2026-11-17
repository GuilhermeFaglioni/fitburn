import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const PRODUCTS = "/api/shop/admin/products";
const IMAGE_BYTES = Buffer.from("fake-webp-image");

describe("Loja: fotos do produto (HTTP)", () => {
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

  async function newProduct(token = admin, visible = true): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(PRODUCTS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Garrafa Fitburn", priceCents: 2500, stock: 8, visivel: visible });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function upload(
    productId: string,
    token = admin,
    mimeType = "image/webp",
    bytes = IMAGE_BYTES,
  ) {
    return request(app.getHttpServer())
      .post(`${PRODUCTS}/${productId}/images`)
      .set("Authorization", `Bearer ${token}`)
      .field("mimeType", mimeType)
      .field("sizeBytes", String(bytes.length))
      .attach("file", bytes, { filename: "foto.webp", contentType: mimeType });
  }

  function image(token: string, id: string) {
    return request(app.getHttpServer())
      .get(`/api/shop/product-images/${id}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it("recusa mime não permitido e arquivo acima de 1,5 MB", async () => {
    const productId = await newProduct();
    const badMime = await upload(productId, admin, "image/gif");
    expect(badMime.status).toBe(400);
    expect(badMime.body.code).toBe("VALIDATION_ERROR");

    const oversized = await upload(productId, admin, "image/webp", Buffer.alloc(1_500_001));
    expect([400, 413]).toContain(oversized.status);
  });

  it("limita o produto a cinco fotos", async () => {
    const productId = await newProduct();
    for (let index = 0; index < 5; index += 1) {
      expect((await upload(productId)).status).toBe(201);
    }

    const sixth = await upload(productId);
    expect(sixth.status).toBe(409);
    expect(sixth.body.code).toBe("CONFLICT");
  });

  it("reordena, troca a capa e remove mantendo posições compactas", async () => {
    const productId = await newProduct();
    const first = await upload(productId);
    const second = await upload(productId);
    const third = await upload(productId);
    const ids = [first.body.id, second.body.id, third.body.id] as string[];

    const reordered = await request(app.getHttpServer())
      .put(`${PRODUCTS}/${productId}/images/order`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ imageIds: [ids[2], ids[0], ids[1]] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((entry: { id: string }) => entry.id)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);

    const covered = await request(app.getHttpServer())
      .put(`${PRODUCTS}/${productId}/images/cover`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ imageId: ids[1] });
    expect(covered.status).toBe(200);
    expect(
      covered.body
        .filter((entry: { isCover: boolean }) => entry.isCover)
        .map((entry: { id: string }) => entry.id),
    ).toEqual([ids[1]]);

    const removed = await request(app.getHttpServer())
      .delete(`${PRODUCTS}/${productId}/images/${ids[1]}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(removed.status).toBe(204);
    const detail = await request(app.getHttpServer())
      .get(`${PRODUCTS}/${productId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(detail.body.images.map((entry: { position: number }) => entry.position)).toEqual([0, 1]);
    expect(detail.body.images.filter((entry: { isCover: boolean }) => entry.isCover)).toHaveLength(
      1,
    );
    expect(detail.body.images[0].isCover).toBe(true);
  });

  it("aplica Criar, Editar e Excluir e escopo total nas operações", async () => {
    const productId = await newProduct();
    const uploaded = await upload(productId);
    const createOnlyProfile = await createAccessProfile({ name: "Equipe Fotos Criar" });
    await grantModuleAccess({
      profileId: createOnlyProfile.id,
      module: "LOJA",
      actions: ["CREATE"],
      scope: "ALL",
    });
    const creator = await signIn("criador", createOnlyProfile.id);
    const ownScopeProfile = await createAccessProfile({ name: "Equipe Fotos Escopo Próprio" });
    await grantModuleAccess({
      profileId: ownScopeProfile.id,
      module: "LOJA",
      actions: ["CREATE", "EDIT", "DELETE"],
      scope: "OWN",
    });
    const ownScope = await signIn("escopo-proprio", ownScopeProfile.id);

    expect((await upload(productId, creator)).status).toBe(201);
    const cannotEdit = await request(app.getHttpServer())
      .put(`${PRODUCTS}/${productId}/images/cover`)
      .set("Authorization", `Bearer ${creator}`)
      .send({ imageId: uploaded.body.id });
    expect(cannotEdit.status).toBe(403);
    expect((await upload(productId, ownScope)).status).toBe(403);

    const cannotDelete = await request(app.getHttpServer())
      .delete(`${PRODUCTS}/${productId}/images/${uploaded.body.id}`)
      .set("Authorization", `Bearer ${creator}`);
    expect(cannotDelete.status).toBe(403);
  });

  it("cliente lê imagem visível, mas não imagem de produto oculto", async () => {
    const visibleId = await newProduct();
    const visibleImage = await upload(visibleId);
    expect((await image(client, visibleImage.body.id)).status).toBe(200);

    const hiddenId = await newProduct(admin, false);
    const hiddenImage = await upload(hiddenId);
    expect((await image(client, hiddenImage.body.id)).status).toBe(404);
    expect((await image(admin, hiddenImage.body.id)).status).toBe(200);

    const viewProfile = await createAccessProfile({ name: "Equipe Fotos Ver" });
    await grantModuleAccess({
      profileId: viewProfile.id,
      module: "LOJA",
      actions: ["VIEW"],
      scope: "ALL",
    });
    const viewer = await signIn("visualizador", viewProfile.id);
    expect((await image(viewer, hiddenImage.body.id)).status).toBe(200);

    const ownViewProfile = await createAccessProfile({ name: "Equipe Fotos Ver Próprio" });
    await grantModuleAccess({
      profileId: ownViewProfile.id,
      module: "LOJA",
      actions: ["VIEW"],
      scope: "OWN",
    });
    const ownViewer = await signIn("visualizador-proprio", ownViewProfile.id);
    expect((await image(ownViewer, hiddenImage.body.id)).status).toBe(404);
  });

  it("faz upload, inclui metadados no produto admin e serve bytes com cache longo", async () => {
    const productId = await newProduct();
    const uploaded = await upload(productId);

    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    expect(uploaded.body).toMatchObject({ mimeType: "image/webp", position: 0, isCover: true });
    expect(uploaded.body.id).toEqual(expect.any(String));

    const detail = await request(app.getHttpServer())
      .get(`${PRODUCTS}/${productId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(detail.status).toBe(200);
    expect(detail.body.images).toEqual([uploaded.body]);

    const content = await image(client, uploaded.body.id);
    expect(content.status).toBe(200);
    expect(content.headers["content-type"]).toContain("image/webp");
    expect(content.headers["cache-control"]).toContain("immutable");
    expect(content.headers["cache-control"]).toContain("max-age");
    expect(content.body).toEqual(IMAGE_BYTES);
  });
});
