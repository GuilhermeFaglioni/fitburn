import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { seedBaseData } from "../src/seed/base-seed.js";
import { cleanDatabase } from "./db-test-helper.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const ENV = {
  ...process.env,
  INITIAL_ADMIN_EMAIL: "admin@fitburn.local",
  INITIAL_ADMIN_PASSWORD: "senha-inicial-forte",
  INITIAL_ADMIN_NAME: "Administradora Fitburn",
};

describe("Seed base de perfis padrão (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it("cria Professor e Funcionário administrativo com as matrizes padrão documentadas", async () => {
    await seedBaseData(app.get(PrismaService), ENV);
    const token = await loginAndGetAccessToken(app, ENV.INITIAL_ADMIN_EMAIL, ENV.INITIAL_ADMIN_PASSWORD);
    const response = await request(app.getHttpServer())
      .get("/api/profiles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const professor = response.body.find((profile: { name: string }) => profile.name === "Professor");
    const employee = response.body.find(
      (profile: { name: string }) => profile.name === "Funcionário administrativo",
    );
    expect(professor).toBeDefined();
    expect(employee).toBeDefined();
    expect(response.body.filter((profile: { name: string }) => profile.name === "Professor")).toHaveLength(1);
    expect(
      response.body.filter(
        (profile: { name: string }) => profile.name === "Funcionário administrativo",
      ),
    ).toHaveLength(1);

    const matrixOf = (profile: { moduleAccess: Array<{ module: string; actions: string[]; scope: string }> }) =>
      Object.fromEntries(
        profile.moduleAccess.map(({ module, actions, scope }) => [module, { actions, scope }]),
      );

    expect(matrixOf(professor)).toEqual({
      DASHBOARD: { actions: ["VIEW"], scope: "ALL" },
      TEMPLATES_DE_AULA: { actions: ["VIEW"], scope: "ALL" },
      OCORRENCIAS: { actions: ["VIEW", "CREATE", "EDIT"], scope: "ASSIGNED_CLASSES" },
      PRESENCA: { actions: ["VIEW", "EXECUTE"], scope: "ASSIGNED_CLASSES" },
      CLIENTES: { actions: ["VIEW"], scope: "ASSIGNED_CLIENTS" },
      FICHAS_DE_TREINO: { actions: ["VIEW", "CREATE", "EDIT"], scope: "ASSIGNED_CLIENTS" },
      GAMIFICACAO: { actions: ["VIEW", "CREATE", "EDIT"], scope: "ASSIGNED_CLIENTS" },
    });
    expect(matrixOf(employee)).toEqual({
      DASHBOARD: { actions: ["VIEW"], scope: "ALL" },
      TEMPLATES_DE_AULA: { actions: ["VIEW"], scope: "ALL" },
      OCORRENCIAS: { actions: ["VIEW"], scope: "ALL" },
      RESERVAS: { actions: ["VIEW", "CREATE", "EDIT"], scope: "ALL" },
      CLIENTES: { actions: ["VIEW", "CREATE", "EDIT"], scope: "ALL" },
      PLANOS: { actions: ["VIEW", "CREATE", "EDIT"], scope: "ALL" },
      GAMIFICACAO: { actions: ["VIEW"], scope: "ALL" },
    });
  }, 30_000);

  it("preserva perfil, matriz e permissões removidas quando o seed roda novamente", async () => {
    await seedBaseData(app.get(PrismaService), ENV);
    const token = await loginAndGetAccessToken(app, ENV.INITIAL_ADMIN_EMAIL, ENV.INITIAL_ADMIN_PASSWORD);
    const before = await request(app.getHttpServer())
      .get("/api/profiles")
      .set("Authorization", `Bearer ${token}`);
    const professor = before.body.find((profile: { name: string }) => profile.name === "Professor");
    const employee = before.body.find(
      (profile: { name: string }) => profile.name === "Funcionário administrativo",
    );

    for (const [profile, description, module, scope] of [
      [professor, "Matriz do Professor ajustada", "CLIENTES", "ASSIGNED_CLIENTS"],
      [employee, "Matriz da recepção ajustada", "PLANOS", "ALL"],
    ] as const) {
      const updated = await request(app.getHttpServer())
        .patch(`/api/profiles/${profile.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description });
      expect(updated.status).toBe(200);

      const accessRemoved = await request(app.getHttpServer())
        .put(`/api/profiles/${profile.id}/module-access/${module}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ actions: [], scope });
      expect(accessRemoved.status).toBe(200);

      const deactivated = await request(app.getHttpServer())
        .post(`/api/profiles/${profile.id}/deactivate`)
        .set("Authorization", `Bearer ${token}`);
      expect(deactivated.status).toBe(201);
    }

    await seedBaseData(app.get(PrismaService), ENV);
    const after = await request(app.getHttpServer())
      .get("/api/profiles")
      .set("Authorization", `Bearer ${token}`);
    const preservedProfessor = after.body.find(
      (profile: { name: string }) => profile.name === "Professor",
    );
    const preservedEmployee = after.body.find(
      (profile: { name: string }) => profile.name === "Funcionário administrativo",
    );

    expect(preservedProfessor).toMatchObject({
      description: "Matriz do Professor ajustada",
      isActive: false,
    });
    expect(
      preservedProfessor.moduleAccess.map((access: { module: string }) => access.module),
    ).not.toContain("CLIENTES");
    expect(preservedEmployee).toMatchObject({
      description: "Matriz da recepção ajustada",
      isActive: false,
    });
    expect(
      preservedEmployee.moduleAccess.map((access: { module: string }) => access.module),
    ).not.toContain("PLANOS");
    expect(after.body.filter((profile: { name: string }) => profile.name === "Professor")).toHaveLength(1);
    expect(
      after.body.filter(
        (profile: { name: string }) => profile.name === "Funcionário administrativo",
      ),
    ).toHaveLength(1);
  }, 30_000);
});
