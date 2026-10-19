import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./test-app.js";
import { PostgresTcpProxy } from "./postgres-tcp-proxy.js";

describe("Health (HTTP)", () => {
  let app: INestApplication;
  let proxy: PostgresTcpProxy;

  beforeAll(async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    proxy = new PostgresTcpProxy(process.env.DATABASE_URL_TEST ?? "");
    await proxy.listen();
    process.env.DATABASE_URL = proxy.connectionString;

    try {
      app = await createTestApp();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  afterEach(() => {
    proxy.setAvailable(true);
    proxy.resumeResponses();
  });

  afterAll(async () => {
    await app.close();
    await proxy.close();
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

  it("GET /api/health/live confirma que o processo responde", async () => {
    const response = await request(app.getHttpServer()).get("/api/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok" });
    expect(typeof response.body.timestamp).toBe("string");
    expect(response.body).not.toHaveProperty("database");
  });

  it("GET /api/health/ready retorna sucesso com o banco conectado", async () => {
    const response = await request(app.getHttpServer()).get("/api/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", database: "connected" });
    expect(typeof response.body.timestamp).toBe("string");
  });

  it("mantém liveness e recupera readiness depois de uma desconexão do banco", async () => {
    proxy.setAvailable(false);

    try {
      const liveness = await request(app.getHttpServer()).get("/api/health/live");
      expect(liveness.status).toBe(200);
      expect(liveness.body).toMatchObject({ status: "ok" });
      expect(liveness.body).not.toHaveProperty("database");

      for (const path of ["/api/health/ready", "/api/health"]) {
        const readiness = await request(app.getHttpServer()).get(path);

        expect(readiness.status).toBe(503);
        expect(readiness.body).toMatchObject({ status: "error", database: "disconnected" });
        expect(Object.keys(readiness.body).sort()).toEqual(["database", "status", "timestamp"]);
      }
    } finally {
      proxy.setAvailable(true);
    }

    const recovered = await request(app.getHttpServer()).get("/api/health/ready");
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ status: "ok", database: "connected" });
  });

  it("retorna 503 quando a consulta de readiness excede o timeout", async () => {
    proxy.pauseResponses();

    try {
      const response = await request(app.getHttpServer()).get("/api/health/ready");

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ status: "error", database: "disconnected" });
      expect(Object.keys(response.body).sort()).toEqual(["database", "status", "timestamp"]);
    } finally {
      proxy.resumeResponses();
    }

    const recovered = await request(app.getHttpServer()).get("/api/health/ready");
    expect(recovered.status).toBe(200);
  });
});
