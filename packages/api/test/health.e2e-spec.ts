import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
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

  it("registra requisições com campos permitidos, sem incluir query ou dados pessoais", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    try {
      const response = await request(app.getHttpServer()).get(
        "/api/health?email=ana%40example.com&document=12345678900",
      );
      const entryText = log.mock.calls
        .map(([message]) => String(message))
        .find((message) => message.includes('"event":"http.request"'));

      expect(response.status).toBe(200);
      expect(entryText).toBeDefined();

      const entry = JSON.parse(entryText!) as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual([
        "durationMs",
        "event",
        "method",
        "route",
        "statusCode",
      ]);
      expect(entry).toMatchObject({ event: "http.request", method: "GET", statusCode: 200 });
      expect(JSON.stringify(entry)).not.toContain("ana@example.com");
      expect(JSON.stringify(entry)).not.toContain("12345678900");
    } finally {
      log.mockRestore();
    }
  });
});
