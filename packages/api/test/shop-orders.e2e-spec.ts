import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const ADMIN_PRODUCTS = "/api/shop/admin/products";
const CREATE_ORDER = "/api/shop/orders";

describe("Pedidos da loja (HTTP)", () => {
  let app: INestApplication;
  let admin: string;
  let client: string;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await cleanDatabase();
    const adminProfile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    await grantModuleAccess({ profileId: adminProfile.id, module: "LOJA", actions: ["VIEW", "CREATE", "EDIT", "DELETE"], scope: "ALL" });
    admin = await signIn("admin", adminProfile.id);
    client = await signIn("cliente", clientProfile.id);
  });

  async function signIn(name: string, profileId: string): Promise<string> {
    const user = await createUser({ email: `${name}@fitburn.local`, password: PASSWORD, profileId, fullName: name });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  async function createAnotherClient(name: string): Promise<string> {
    const profile = await testPrisma.user.findFirstOrThrow({ where: { email: "cliente@fitburn.local" }, select: { profileId: true } });
    return signIn(name, profile.profileId);
  }

  async function createProduct(overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer()).post(ADMIN_PRODUCTS)
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Camiseta Fitburn", priceCents: 5000, stock: 8, ...overrides });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body;
  }

  function createOrder(items: Array<{ variantId: string; quantity: number }>, key = randomUUID(), token = client) {
    return request(app.getHttpServer()).post(CREATE_ORDER)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ items });
  }

  it("cria pedido aguardando aprovação, baixa estoque e registra o retrato e evento inicial", async () => {
    const product = await createProduct({ name: "Camiseta Fitburn", priceCents: 5000, promoPriceCents: 4500, stock: 0, permiteMaisDeUmaUnidade: true, limitePorPedido: 3,
      options: [{ name: "Cor", values: ["Azul"] }], variants: [{ combination: ["Azul"], stock: 3 }] });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;

    const response = await createOrder([{ variantId, quantity: 2 }]);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ number: 1, status: "AGUARDANDO_APROVACAO", totalCents: 9000,
      items: [{ productName: "Camiseta Fitburn", variantLabel: "Azul", options: [{ name: "Cor", value: "Azul" }], unitPriceCents: 4500, quantity: 2, subtotalCents: 9000 }],
      events: [{ fromStatus: null, toStatus: "AGUARDANDO_APROVACAO" }] });
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stock: 1 });
  });

  it("repete a resposta para a mesma chave sem baixar estoque duas vezes", async () => {
    const product = await createProduct({ permiteMaisDeUmaUnidade: true, limitePorPedido: 3, stock: 5 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;
    const key = randomUUID();

    const first = await createOrder([{ variantId, quantity: 2 }], key);
    const second = await createOrder([{ variantId, quantity: 2 }], key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stock: 3 });
    expect(await testPrisma.shopOrder.count()).toBe(1);
  });

  it("concede a última unidade a apenas um de dois pedidos simultâneos", async () => {
    const otherClient = await createAnotherClient("cliente2");
    const product = await createProduct({ permiteMaisDeUmaUnidade: true, limitePorPedido: 1, stock: 1 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;

    const responses = await Promise.all([
      createOrder([{ variantId, quantity: 1 }], randomUUID(), client),
      createOrder([{ variantId, quantity: 1 }], randomUUID(), otherClient),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toMatchObject({ code: "SHOP_STOCK_CONFLICT", details: { items: [{ variantId, requestedQuantity: 1, availableQuantity: 0 }] } });
    expect(await testPrisma.shopOrder.count()).toBe(1);
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stock: 0 });
  });

  it("devolve disponibilidade por item quando o estoque mudou", async () => {
    const firstProduct = await createProduct({ name: "Garrafa", stock: 1, permiteMaisDeUmaUnidade: true, limitePorPedido: 5 });
    const secondProduct = await createProduct({ name: "Toalha", stock: 4, permiteMaisDeUmaUnidade: true, limitePorPedido: 5 });
    const firstVariantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: firstProduct.id } })).id;
    const secondVariantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: secondProduct.id } })).id;

    const response = await createOrder([{ variantId: firstVariantId, quantity: 2 }, { variantId: secondVariantId, quantity: 1 }]);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "SHOP_STOCK_CONFLICT", details: { items: [
      { variantId: firstVariantId, requestedQuantity: 2, availableQuantity: 1 },
      { variantId: secondVariantId, requestedQuantity: 1, availableQuantity: 4 },
    ] } });
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: secondVariantId } })).toMatchObject({ stock: 4 });
    expect(await testPrisma.shopOrder.count()).toBe(0);
  });

  it("valida quantidade mínima, limite configurado e não permite exceder o estoque", async () => {
    const product = await createProduct({ stock: 5, permiteMaisDeUmaUnidade: true, limitePorPedido: 2 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;

    const belowMinimum = await createOrder([{ variantId, quantity: 0 }]);
    const aboveLimit = await createOrder([{ variantId, quantity: 3 }]);
    await testPrisma.productVariant.update({ where: { id: variantId }, data: { stock: 1 } });
    const aboveStock = await createOrder([{ variantId, quantity: 2 }]);

    expect(belowMinimum.status).toBe(400);
    expect(aboveLimit.status).toBe(422);
    expect(aboveLimit.body.code).toBe("PRODUCT_ORDER_LIMIT_EXCEEDED");
    expect(aboveStock.status).toBe(409);
    expect(aboveStock.body.details.items[0]).toMatchObject({ requestedQuantity: 2, availableQuantity: 1 });
    expect(await testPrisma.shopOrder.count()).toBe(0);
  });

  it("cancela enquanto aguarda e devolve o estoque", async () => {
    const product = await createProduct({ permiteMaisDeUmaUnidade: true, limitePorPedido: 3, stock: 4 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;
    const created = await createOrder([{ variantId, quantity: 2 }]);
    const attempts = await Promise.all([0, 1].map(() => request(app.getHttpServer())
      .post(`${CREATE_ORDER}/${created.body.id}/cancel`).set("Authorization", `Bearer ${client}`)));
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
    const cancelled = attempts.find(({ status }) => status === 201)!;

    expect(cancelled.status).toBe(201);
    expect(cancelled.body).toMatchObject({ status: "CANCELADO", events: [
      { fromStatus: null, toStatus: "AGUARDANDO_APROVACAO" },
      { fromStatus: "AGUARDANDO_APROVACAO", toStatus: "CANCELADO" },
    ] });
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stock: 4 });

    expect(attempts.find(({ status }) => status === 409)?.body).toMatchObject({ code: "ORDER_INVALID_TRANSITION" });
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stock: 4 });
  });

  it("restringe as rotas de pedidos próprios ao perfil Cliente", async () => {
    const staffProfile = await createAccessProfile({ name: "Equipe" });
    const staff = await signIn("equipe", staffProfile.id);

    const response = await request(app.getHttpServer()).get(CREATE_ORDER)
      .set("Authorization", `Bearer ${staff}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("expõe somente o número do pedido aprovado mais recente do cliente", async () => {
    const otherClient = await createAnotherClient("cliente2");
    const emptyNotice = await request(app.getHttpServer()).get(`${CREATE_ORDER}/approval-notice`)
      .set("Authorization", `Bearer ${client}`);
    expect(emptyNotice.status).toBe(200);
    expect(emptyNotice.body).toEqual({ number: null });
    const product = await createProduct({ permiteMaisDeUmaUnidade: true, limitePorPedido: 5, stock: 8 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;
    const first = await createOrder([{ variantId, quantity: 1 }]);
    const latest = await createOrder([{ variantId, quantity: 1 }]);
    const other = await createOrder([{ variantId, quantity: 1 }], randomUUID(), otherClient);
    await approveOrder(first.body.id);
    await approveOrder(latest.body.id);
    await approveOrder(other.body.id);

    const response = await request(app.getHttpServer()).get(`${CREATE_ORDER}/approval-notice`)
      .set("Authorization", `Bearer ${client}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ number: latest.body.number });
    expect(Object.keys(response.body)).toEqual(["number"]);
  });

  it("lista e detalha somente os pedidos do próprio cliente, incluindo a linha do tempo e o motivo da recusa", async () => {
    const otherClient = await createAnotherClient("cliente2");
    const product = await createProduct({ stock: 4 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;
    const mine = await createOrder([{ variantId, quantity: 1 }]);
    const theirs = await createOrder([{ variantId, quantity: 1 }], randomUUID(), otherClient);
    await testPrisma.shopOrder.update({ where: { id: mine.body.id }, data: { status: "RECUSADO" } });
    await testPrisma.shopOrderEvent.create({ data: {
      orderId: mine.body.id, fromStatus: "AGUARDANDO_APROVACAO", toStatus: "RECUSADO",
      actorId: await adminUserId(), note: "Tamanho indisponível para retirada.",
    } });

    const list = await request(app.getHttpServer()).get(CREATE_ORDER)
      .set("Authorization", `Bearer ${client}`);
    const detail = await request(app.getHttpServer()).get(`${CREATE_ORDER}/${mine.body.id}`)
      .set("Authorization", `Bearer ${client}`);
    const otherDetail = await request(app.getHttpServer()).get(`${CREATE_ORDER}/${theirs.body.id}`)
      .set("Authorization", `Bearer ${client}`);

    expect(list.status).toBe(200);
    expect(list.body.map((order: { id: string }) => order.id)).toEqual([mine.body.id]);
    expect(detail.body).toMatchObject({
      number: mine.body.number, status: "RECUSADO", totalCents: mine.body.totalCents,
      items: [{ productName: "Camiseta Fitburn", quantity: 1 }],
      events: [{ toStatus: "AGUARDANDO_APROVACAO" }, { toStatus: "RECUSADO", note: "Tamanho indisponível para retirada." }],
    });
    expect(otherDetail.status).toBe(404);
    expect(otherDetail.body).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("recusa cancelar pedido aprovado sem devolver o estoque", async () => {
    const product = await createProduct({ permiteMaisDeUmaUnidade: true, limitePorPedido: 3, stock: 4 });
    const variantId = (await testPrisma.productVariant.findFirstOrThrow({ where: { productId: product.id } })).id;
    const created = await createOrder([{ variantId, quantity: 2 }]);
    await approveOrder(created.body.id);

    const response = await request(app.getHttpServer()).post(`${CREATE_ORDER}/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${client}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "ORDER_INVALID_TRANSITION" });
    expect(await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stock: 2 });
  });

  async function approveOrder(orderId: string) {
    const order = await testPrisma.shopOrder.findUniqueOrThrow({ where: { id: orderId }, select: { clientId: true, status: true } });
    await testPrisma.shopOrder.update({ where: { id: orderId }, data: { status: "APROVADO" } });
    await testPrisma.shopOrderEvent.create({ data: {
      orderId, fromStatus: order.status, toStatus: "APROVADO", actorId: order.clientId,
    } });
  }

  async function adminUserId(): Promise<string> {
    return (await testPrisma.user.findFirstOrThrow({ where: { email: "admin@fitburn.local" }, select: { id: true } })).id;
  }
});
