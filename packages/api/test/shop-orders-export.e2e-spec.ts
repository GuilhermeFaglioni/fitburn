import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { gymDateTimeToUtc } from "@fitburn/contracts";
import request from "supertest";
import { asBinary, hasUtf8Bom, parseCsv } from "./csv-test-utils.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser, grantModuleAccess } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const ADMIN_PRODUCTS = "/api/shop/admin/products";
const CREATE_ORDER = "/api/shop/orders";
const EXPORT = "/api/exports/shop-orders";
const DAY = "2026-11-10";
const HEADER = [
  "Pedido",
  "Data",
  "Cliente",
  "Status",
  "Produto",
  "Variação",
  "Quantidade",
  "Preço unitário",
  "Subtotal",
  "Total do pedido",
];

describe("Exportação de pedidos da Loja em CSV (HTTP)", () => {
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
    const adminProfile = await createAccessProfile({ name: "Administração da Loja" });
    await grantModuleAccess({
      profileId: adminProfile.id,
      module: "LOJA",
      actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXECUTE"],
      scope: "ALL",
    });
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    admin = await signIn("admin", adminProfile.id);
    client = await signIn("cliente", clientProfile.id, '=Cliente; "Fictício"');
  });

  async function signIn(emailName: string, profileId: string, fullName = emailName): Promise<string> {
    const user = await createUser({
      email: `${emailName}@fitburn.local`,
      password: PASSWORD,
      profileId,
      fullName,
    });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  async function createProduct(
    name: string,
    priceCents: number,
    optionValue?: string,
  ): Promise<string> {
    const base = {
      name,
      priceCents,
      permiteMaisDeUmaUnidade: true,
      limitePorPedido: 20,
    };
    const payload = optionValue
      ? {
          ...base,
          stock: 0,
          options: [{ name: "Cor", values: [optionValue] }],
          variants: [{ combination: [optionValue], stock: 20 }],
        }
      : { ...base, stock: 20 };
    const response = await request(app.getHttpServer())
      .post(ADMIN_PRODUCTS)
      .set("Authorization", `Bearer ${admin}`)
      .send(payload);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return (
      await testPrisma.productVariant.findFirstOrThrow({ where: { productId: response.body.id } })
    ).id;
  }

  async function createOrder(items: Array<{ variantId: string; quantity: number }>, token = client) {
    return request(app.getHttpServer())
      .post(CREATE_ORDER)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({ items });
  }

  function exportUrl(from: string, to: string): string {
    return `${EXPORT}?from=${from}&to=${to}`;
  }

  function get(url: string, token?: string) {
    const test = request(app.getHttpServer()).get(url);
    return token ? test.set("Authorization", `Bearer ${token}`) : test;
  }

  async function downloadCsv(token: string, from: string, to: string) {
    const response = await asBinary(get(exportUrl(from, to), token));
    const bytes = response.body as Buffer;
    const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : "";
    return {
      response,
      bytes,
      text,
      rows: Buffer.isBuffer(bytes) ? parseCsv(text) : [],
    };
  }

  it("exporta uma linha por item com colunas em português, totais e escape CSV", async () => {
    const markedProduct = await createProduct('=Produto; "Fictício"', 2499, "+Azul");
    const simpleProduct = await createProduct("Camiseta básica", 1000);
    const created = await createOrder([
      { variantId: markedProduct, quantity: 2 },
      { variantId: simpleProduct, quantity: 1 },
    ]);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await testPrisma.shopOrder.update({
      where: { id: created.body.id },
      data: { createdAt: gymDateTimeToUtc(DAY, "12:34") },
    });

    const { response, bytes, text, rows } = await downloadCsv(admin, DAY, DAY);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="pedidos_${DAY}_${DAY}.csv"`,
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(hasUtf8Bom(bytes)).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(rows[0]).toEqual(HEADER);
    expect(rows).toHaveLength(3);
    const dataRows = rows.slice(1);
    expect(dataRows.map((row) => row[4]).sort()).toEqual([
      "'=Produto; \"Fictício\"",
      "Camiseta básica",
    ]);
    const markedItem = dataRows.find((row) => row[4] === "'=Produto; \"Fictício\"");
    const simpleItem = dataRows.find((row) => row[4] === "Camiseta básica");
    expect(markedItem).toEqual([
      String(created.body.number),
      DAY,
      `'=Cliente; "Fictício"`,
      "AGUARDANDO_APROVACAO",
      `'=Produto; "Fictício"`,
      "'+Azul",
      "2",
      "24,99",
      "49,98",
      "59,98",
    ]);
    expect(simpleItem).toEqual([
      String(created.body.number),
      DAY,
      `'=Cliente; "Fictício"`,
      "AGUARDANDO_APROVACAO",
      "Camiseta básica",
      "",
      "1",
      "10",
      "10",
      "59,98",
    ]);
    expect(text).toContain('"\'=Produto; ""Fictício"""');
    expect(text).not.toContain("@fitburn.local");
  });

  it("filtra pela data local de criação, incluindo as pontas do dia", async () => {
    const variantId = await createProduct("Produto de teste", 500);
    const orders = await Promise.all(
      Array.from({ length: 4 }, () => createOrder([{ variantId, quantity: 1 }])),
    );
    expect(orders.map(({ status }) => status)).toEqual([201, 201, 201, 201]);
    const timestamps = [
      gymDateTimeToUtc("2026-11-09", "23:59"),
      gymDateTimeToUtc(DAY, "00:00"),
      gymDateTimeToUtc(DAY, "23:59"),
      gymDateTimeToUtc("2026-11-11", "00:00"),
    ];
    for (const [index, order] of orders.entries()) {
      await testPrisma.shopOrder.update({
        where: { id: order.body.id },
        data: { createdAt: timestamps[index] },
      });
    }

    const { response, rows } = await downloadCsv(admin, DAY, DAY);

    expect(response.status).toBe(200);
    expect(rows.slice(1).map((cells) => cells[0])).toEqual([
      String(orders[1].body.number),
      String(orders[2].body.number),
    ]);
    expect(rows.slice(1).map((cells) => cells[1])).toEqual([DAY, DAY]);
  });

  describe("Validação do período", () => {
    it("aceita exatamente 92 dias inclusive", async () => {
      const { response } = await downloadCsv(admin, "2026-08-01", "2026-10-31");
      expect(response.status).toBe(200);
    });

    it.each([
      ["data inicial posterior à final", "from=2026-10-10&to=2026-10-09"],
      ["período acima de 92 dias", "from=2026-08-01&to=2026-11-01"],
    ])("%s retorna 400", async (_label, query) => {
      const response = await get(`${EXPORT}?${query}`, admin);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it.each([
      ["data inexistente", "from=2026-02-31&to=2026-10-05", "from"],
      ["formato inválido", "from=05/10/2026&to=2026-10-05", "from"],
      ["data final ausente", "from=2026-10-05", "to"],
      ["período ausente", "", "from"],
    ])("%s retorna 400 e indica o campo", async (_label, query, field) => {
      const response = await get(`${EXPORT}${query ? `?${query}` : ""}`, admin);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.details.fieldErrors).toHaveProperty(field);
    });
  });

  describe("Permissões", () => {
    it("sem token retorna 401", async () => {
      const response = await get(exportUrl(DAY, DAY));
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHENTICATED");
    });

    it("exige LOJA:VIEW", async () => {
      const response = await get(exportUrl(DAY, DAY), client);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    });

    it("exige escopo total, como a listagem administrativa da Loja", async () => {
      const profile = await createAccessProfile({ name: "Consulta restrita da Loja" });
      await grantModuleAccess({
        profileId: profile.id,
        module: "LOJA",
        actions: ["VIEW"],
        scope: "OWN",
      });
      const token = await signIn("consulta-restrita", profile.id);

      const response = await get(exportUrl(DAY, DAY), token);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: "OUT_OF_SCOPE",
        message: "Só quem tem acesso a todos os dados gerencia a loja.",
      });
    });
  });
});
