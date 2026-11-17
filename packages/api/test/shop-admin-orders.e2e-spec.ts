import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const ADMIN_PRODUCTS = "/api/shop/admin/products";
const ADMIN_ORDERS = "/api/shop/admin/orders";
const CREATE_ORDER = "/api/shop/orders";

describe("Fila administrativa de pedidos (HTTP)", () => {
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
      actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXECUTE"],
      scope: "ALL",
    });
    admin = await signIn("admin", adminProfile.id);
    client = await signIn("cliente", clientProfile.id);
  });

  async function signIn(
    emailName: string,
    profileId: string,
    fullName = emailName,
  ): Promise<string> {
    const user = await createUser({
      email: `${emailName}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName,
    });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  async function createProduct(stock = 8) {
    const response = await request(app.getHttpServer())
      .post(ADMIN_PRODUCTS)
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Camiseta da fila",
        priceCents: 5000,
        stock,
        permiteMaisDeUmaUnidade: true,
        limitePorPedido: 20,
      });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return (
      await testPrisma.productVariant.findFirstOrThrow({ where: { productId: response.body.id } })
    ).id;
  }

  async function createOrder(variantId: string, token = client) {
    return request(app.getHttpServer())
      .post(CREATE_ORDER)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({ items: [{ variantId, quantity: 1 }] });
  }

  function adminRequest() {
    return request(app.getHttpServer()).get(ADMIN_ORDERS).set("Authorization", `Bearer ${admin}`);
  }

  it("filtra por número, nome, status e período de criação e expõe o contador", async () => {
    const variantId = await createProduct();
    const firstClientProfile = await testPrisma.user.findFirstOrThrow({
      where: { email: "cliente@fitburn.local" },
      select: { profileId: true },
    });
    const first = await createOrder(
      variantId,
      await signIn("mariana", firstClientProfile.profileId, "Mariana Costa"),
    );
    const second = await createOrder(
      variantId,
      await signIn("paulo", firstClientProfile.profileId, "Paulo Lima"),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    await testPrisma.shopOrder.update({
      where: { id: first.body.id },
      data: { createdAt: new Date("2026-11-10T15:00:00.000Z") },
    });
    await testPrisma.shopOrder.update({
      where: { id: second.body.id },
      data: { createdAt: new Date("2026-11-11T15:00:00.000Z") },
    });
    await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${first.body.id}/approve`)
      .set("Authorization", `Bearer ${admin}`);

    const byName = await adminRequest().query({ q: "mariana" });
    const byNumber = await adminRequest().query({ q: String(first.body.number) });
    const byStatus = await adminRequest().query({ status: "APROVADO" });
    const byDate = await adminRequest().query({ from: "2026-11-10", to: "2026-11-10" });
    const pendingCount = await request(app.getHttpServer())
      .get(`${ADMIN_ORDERS}/pending-count`)
      .set("Authorization", `Bearer ${admin}`);

    for (const response of [byName, byNumber, byStatus, byDate]) {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: first.body.id,
        number: first.body.number,
        status: "APROVADO",
        totalCents: 5000,
        client: { fullName: "Mariana Costa" },
        items: [{ productName: "Camiseta da fila", quantity: 1, subtotalCents: 5000 }],
      });
    }
    expect(pendingCount.status).toBe(200);
    expect(pendingCount.body).toEqual({ count: 1 });
  });

  it("aprova e entrega com evento identificado pelo autor, sem devolver estoque", async () => {
    const variantId = await createProduct();
    const created = await createOrder(variantId);
    const adminId = (
      await testPrisma.user.findFirstOrThrow({ where: { email: "admin@fitburn.local" } })
    ).id;

    const approved = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${admin}`);
    const delivered = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/deliver`)
      .set("Authorization", `Bearer ${admin}`);

    expect(approved.status).toBe(201);
    expect(approved.body).toMatchObject({
      status: "APROVADO",
      events: [
        { toStatus: "AGUARDANDO_APROVACAO" },
        { fromStatus: "AGUARDANDO_APROVACAO", toStatus: "APROVADO", actorId: adminId, note: null },
      ],
    });
    expect(delivered.status).toBe(201);
    expect(delivered.body).toMatchObject({
      status: "ENTREGUE",
      events: [
        { toStatus: "AGUARDANDO_APROVACAO" },
        { toStatus: "APROVADO" },
        { toStatus: "ENTREGUE", fromStatus: "APROVADO", actorId: adminId },
      ],
    });
    expect(
      (await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(7);
  });

  it("recusa uma única vez, registra o motivo e devolve o estoque uma única vez", async () => {
    const variantId = await createProduct();
    const created = await createOrder(variantId);
    const adminId = (
      await testPrisma.user.findFirstOrThrow({ where: { email: "admin@fitburn.local" } })
    ).id;
    const rejects = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post(`${ADMIN_ORDERS}/${created.body.id}/reject`)
          .set("Authorization", `Bearer ${admin}`)
          .send({ reason: "Retirada indisponível nesta semana." }),
      ),
    );

    expect(rejects.map(({ status }) => status).sort()).toEqual([201, 409]);
    const rejected = rejects.find(({ status }) => status === 201)!;
    expect(rejected.body).toMatchObject({
      status: "RECUSADO",
      events: [
        { toStatus: "AGUARDANDO_APROVACAO" },
        {
          fromStatus: "AGUARDANDO_APROVACAO",
          toStatus: "RECUSADO",
          actorId: adminId,
          note: "Retirada indisponível nesta semana.",
        },
      ],
    });
    expect(rejects.find(({ status }) => status === 409)?.body).toMatchObject({
      code: "ORDER_INVALID_TRANSITION",
    });
    expect(
      await testPrisma.shopOrderEvent.count({
        where: { orderId: created.body.id, toStatus: "RECUSADO" },
      }),
    ).toBe(1);
    expect(
      (await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(8);
  });

  it("permite recusar sem motivo", async () => {
    const variantId = await createProduct();
    const created = await createOrder(variantId);
    const rejected = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${admin}`)
      .send({});

    expect(rejected.status).toBe(201);
    expect(rejected.body).toMatchObject({
      status: "RECUSADO",
      events: [
        { toStatus: "AGUARDANDO_APROVACAO" },
        { fromStatus: "AGUARDANDO_APROVACAO", toStatus: "RECUSADO", note: null },
      ],
    });
    expect(
      (await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(8);
  });

  it("recusa transições fora da ordem permitida", async () => {
    const variantId = await createProduct();
    const created = await createOrder(variantId);
    const pendingDelivery = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/deliver`)
      .set("Authorization", `Bearer ${admin}`);
    expect(pendingDelivery.status).toBe(409);
    expect(pendingDelivery.body).toMatchObject({ code: "ORDER_INVALID_TRANSITION" });

    const approved = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${admin}`);
    const repeatedApproval = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${admin}`);
    const lateRejection = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${admin}`)
      .send({});

    expect(approved.status).toBe(201);
    expect(repeatedApproval.status).toBe(409);
    expect(lateRejection.status).toBe(409);
    expect(repeatedApproval.body).toMatchObject({ code: "ORDER_INVALID_TRANSITION" });
    expect(lateRejection.body).toMatchObject({ code: "ORDER_INVALID_TRANSITION" });
    expect(
      (await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(7);
  });

  it("separa permissão de leitura da permissão de execução", async () => {
    const variantId = await createProduct();
    const created = await createOrder(variantId);
    const viewProfile = await createAccessProfile({ name: "Consulta de pedidos" });
    const executeProfile = await createAccessProfile({ name: "Execução de pedidos" });
    await grantModuleAccess({
      profileId: viewProfile.id,
      module: "LOJA",
      actions: ["VIEW"],
      scope: "ALL",
    });
    await grantModuleAccess({
      profileId: executeProfile.id,
      module: "LOJA",
      actions: ["EXECUTE"],
      scope: "ALL",
    });
    const viewer = await signIn("consulta", viewProfile.id);
    const executor = await signIn("executor", executeProfile.id);

    expect(
      (
        await request(app.getHttpServer())
          .get(ADMIN_ORDERS)
          .set("Authorization", `Bearer ${viewer}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .get(`${ADMIN_ORDERS}/pending-count`)
          .set("Authorization", `Bearer ${viewer}`)
      ).status,
    ).toBe(200);
    const forbiddenAction = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${viewer}`);
    expect(forbiddenAction.status).toBe(403);

    const forbiddenList = await request(app.getHttpServer())
      .get(ADMIN_ORDERS)
      .set("Authorization", `Bearer ${executor}`);
    expect(forbiddenList.status).toBe(403);
    const forbiddenCount = await request(app.getHttpServer())
      .get(`${ADMIN_ORDERS}/pending-count`)
      .set("Authorization", `Bearer ${executor}`);
    expect(forbiddenCount.status).toBe(403);
    const allowedAction = await request(app.getHttpServer())
      .post(`${ADMIN_ORDERS}/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${executor}`);
    expect(allowedAction.status).toBe(201);
  });
});
