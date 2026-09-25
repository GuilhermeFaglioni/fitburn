import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./test-app.js";

describe("Health (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health retorna sucesso com o banco conectado", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      database: "connected",
    });
    expect(typeof response.body.timestamp).toBe("string");
  });
});
