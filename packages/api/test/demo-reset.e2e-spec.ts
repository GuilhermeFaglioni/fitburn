import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppConfigError } from "../src/config/app-config.js";
import { DemoResetRefusedError, runDemoReset } from "../src/demo-reset/demo-reset.js";
import { seedGamificationRules } from "../src/gamification/default-rules.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import {
  createAccessProfile,
  createOccurrence,
  createReservation,
  createUser,
  grantModuleAccess,
} from "./factories.js";
import { validProductionEnv } from "./production-env.js";
import { createTestApp } from "./test-app.js";

const ADMIN_ENV = {
  INITIAL_ADMIN_EMAIL: "admin.demo@fitburn.test",
  INITIAL_ADMIN_PASSWORD: "Senha-Demo-Forte-123!",
  INITIAL_ADMIN_NAME: "Administrador Demo",
};

async function currentDatabaseName(): Promise<string> {
  const rows = await testPrisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  return rows[0].db;
}

const noMigrate = async (): Promise<void> => {};

function demoEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL,
    DEMO_RESET_ENABLED: "true",
    ...ADMIN_ENV,
    ...overrides,
  };
}

async function plantSentinelData(): Promise<void> {
  const profile = await createAccessProfile({ name: "Perfil que nao deve sumir sem reset" });
  await createUser({
    email: "sentinela@fitburn.test",
    password: "SenhaForte123!",
    profileId: profile.id,
  });
}

async function sentinelSurvived(): Promise<boolean> {
  return (await testPrisma.user.count({ where: { email: "sentinela@fitburn.test" } })) === 1;
}

describe("Reset da demonstração: recusas (nada é apagado)", () => {
  let databaseName: string;

  beforeAll(async () => {
    databaseName = await currentDatabaseName();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await plantSentinelData();
  });

  it("recusa rodar sem a flag de ambiente de demonstração", async () => {
    const env = { NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ...ADMIN_ENV };

    await expect(
      runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate }),
    ).rejects.toBeInstanceOf(DemoResetRefusedError);
    expect(await sentinelSurvived()).toBe(true);
  });

  it.each(["false", "1", "TRUE", ""])(
    "só o valor exato true habilita a flag (recusa %j)",
    async (flag) => {
      const env = demoEnv({ DEMO_RESET_ENABLED: flag });

      await expect(
        runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate }),
      ).rejects.toBeInstanceOf(DemoResetRefusedError);
      expect(await sentinelSurvived()).toBe(true);
    },
  );

  it("recusa sem confirmação explícita", async () => {
    await expect(
      runDemoReset({
        env: demoEnv(),
        confirmation: undefined,
        prisma: testPrisma,
        migrate: noMigrate,
      }),
    ).rejects.toThrow(/confirm/i);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("recusa quando a confirmação não bate com o banco da DATABASE_URL", async () => {
    await expect(
      runDemoReset({
        env: demoEnv(),
        confirmation: "fitburn_prod",
        prisma: testPrisma,
        migrate: noMigrate,
      }),
    ).rejects.toBeInstanceOf(DemoResetRefusedError);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("recusa quando a DATABASE_URL aponta para um banco diferente do conectado", async () => {
    // A confirmação bate com a URL, mas o cliente Prisma está ligado em outro banco.
    const env = demoEnv({
      DATABASE_URL: "postgresql://fitburn:fitburn@localhost:5432/outro_banco",
    });

    await expect(
      runDemoReset({ env, confirmation: "outro_banco", prisma: testPrisma, migrate: noMigrate }),
    ).rejects.toBeInstanceOf(DemoResetRefusedError);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("recusa sem DATABASE_URL", async () => {
    await expect(
      runDemoReset({
        env: demoEnv({ DATABASE_URL: undefined }),
        confirmation: databaseName,
        prisma: testPrisma,
        migrate: noMigrate,
      }),
    ).rejects.toBeInstanceOf(DemoResetRefusedError);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("recusa sem os dados do administrador inicial", async () => {
    await expect(
      runDemoReset({
        env: demoEnv({ INITIAL_ADMIN_PASSWORD: undefined }),
        confirmation: databaseName,
        prisma: testPrisma,
        migrate: noMigrate,
      }),
    ).rejects.toThrow(/INITIAL_ADMIN_PASSWORD/);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("em produção sem a flag, recusa mesmo com a configuração válida e a confirmação certa", async () => {
    const env = { ...validProductionEnv, DATABASE_URL: process.env.DATABASE_URL };

    await expect(
      runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate }),
    ).rejects.toBeInstanceOf(DemoResetRefusedError);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("NODE_ENV ausente conta como produção: sem a flag, recusa", async () => {
    const env = { ...demoEnv({ DEMO_RESET_ENABLED: undefined }), NODE_ENV: undefined };

    await expect(
      runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate }),
    ).rejects.toBeInstanceOf(DemoResetRefusedError);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("em produção com a flag, reaplica a validação de configuração (senha de exemplo do admin)", async () => {
    const env = {
      ...validProductionEnv,
      DATABASE_URL: process.env.DATABASE_URL,
      DEMO_RESET_ENABLED: "true",
      INITIAL_ADMIN_PASSWORD: "TrocarEssaSenha123!",
    };

    await expect(
      runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate }),
    ).rejects.toBeInstanceOf(AppConfigError);
    expect(await sentinelSurvived()).toBe(true);
  });
});

describe("Reset da demonstração: schema do banco", () => {
  let databaseName: string;

  const urlWith = (query: string): string => {
    const url = new URL(process.env.DATABASE_URL as string);
    url.search = query;
    return url.toString();
  };

  beforeAll(async () => {
    databaseName = await currentDatabaseName();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await plantSentinelData();
  });

  it("recusa claramente um schema diferente de public na DATABASE_URL (nada é apagado)", async () => {
    const env = demoEnv({ DATABASE_URL: urlWith("schema=demo_alt") });

    await expect(
      runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate }),
    ).rejects.toThrow(/schema.*demo_alt.*public/i);
    expect(await sentinelSurvived()).toBe(true);
  });

  it("aceita ?schema=public explícito e limpa de verdade", async () => {
    const env = demoEnv({ DATABASE_URL: urlWith("schema=public") });

    await runDemoReset({
      env,
      confirmation: databaseName,
      prisma: testPrisma,
      migrate: noMigrate,
    });

    expect(await sentinelSurvived()).toBe(false);
    expect(await testPrisma.user.count()).toBe(1);
  });

  it("recusa quando o schema efetivo da conexão não é o da DATABASE_URL (nada é apagado)", async () => {
    // Conexão com search_path apontando para outro schema, enquanto a URL declara public.
    const other = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: urlWith("options=-c%20search_path%3Dpg_catalog"),
      }),
    });
    try {
      await expect(
        runDemoReset({
          env: demoEnv(),
          confirmation: databaseName,
          prisma: other,
          migrate: noMigrate,
        }),
      ).rejects.toThrow(/schema/i);
    } finally {
      await other.$disconnect();
    }
    expect(await sentinelSurvived()).toBe(true);
  });

  it("não diz concluído se não havia nenhuma tabela para limpar (banco sem migrations)", async () => {
    const emptyDb = `fitburn_reset_empty_${process.pid}`;
    await testPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${emptyDb}"`);
    await testPrisma.$executeRawUnsafe(`CREATE DATABASE "${emptyDb}"`);
    const url = new URL(process.env.DATABASE_URL as string);
    url.pathname = `/${emptyDb}`;
    const empty = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
    try {
      await expect(
        runDemoReset({
          env: demoEnv({ DATABASE_URL: url.toString() }),
          confirmation: emptyDb,
          prisma: empty,
          migrate: noMigrate,
        }),
      ).rejects.toThrow(/nenhuma tabela/i);
    } finally {
      await empty.$disconnect();
      await testPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${emptyDb}"`);
    }
  });
});

/** Estado do banco sem ids e timestamps, para comparar dois resets. */
async function stateSnapshot() {
  const users = await testPrisma.user.findMany({
    include: { profile: true },
    orderBy: { email: "asc" },
  });
  const profiles = await testPrisma.accessProfile.findMany({
    include: { moduleAccess: true },
    orderBy: { name: "asc" },
  });
  const rules = await testPrisma.gamificationRule.findMany({
    orderBy: [{ kind: "asc" }, { threshold: "asc" }],
  });
  return {
    users: users.map((u) => ({
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      profile: u.profile.name,
    })),
    profiles: profiles.map((p) => ({
      name: p.name,
      isSystem: p.isSystem,
      isActive: p.isActive,
      access: p.moduleAccess
        .map((m) => ({ module: m.module, actions: m.actions, scope: m.scope }))
        .sort((a, b) => a.module.localeCompare(b.module)),
    })),
    rules: rules.map((r) => ({ kind: r.kind, threshold: r.threshold, points: r.points })),
  };
}

/** Linhas por tabela do schema (exceto o histórico de migrations). */
async function rowCountsByTable(): Promise<Record<string, number>> {
  const tables = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [row] = await testPrisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM "public"."${tablename}"`,
    );
    counts[tablename] = row.n;
  }
  return counts;
}

async function plantDemoData(): Promise<void> {
  const admin = await createAccessProfile({ name: "Administrador", isSystem: true });
  const client = await createAccessProfile({ name: "Cliente", isSystem: true });
  const professor = await createAccessProfile({ name: "Professor" });
  await grantModuleAccess({
    profileId: professor.id,
    module: "PRESENCA",
    actions: ["VIEW", "EXECUTE"],
    scope: "ASSIGNED_CLASSES",
  });
  // O admin antigo tem outra senha e outro nome: o reset o recria com os dados do ambiente.
  await createUser({
    email: ADMIN_ENV.INITIAL_ADMIN_EMAIL,
    password: "SenhaAntiga123!",
    profileId: admin.id,
    fullName: "Admin Antigo",
  });
  const teacher = await createUser({
    email: "prof@fitburn.test",
    password: "SenhaForte123!",
    profileId: professor.id,
  });
  const aluno = await createUser({
    email: "aluno@fitburn.test",
    password: "SenhaForte123!",
    profileId: client.id,
  });
  const occurrence = await createOccurrence(new Date(Date.now() + 86_400_000), {
    instructorId: teacher.id,
  });
  await createReservation(aluno.id, occurrence.id);
  await testPrisma.plan.create({ data: { name: "Plano Ouro" } });
  await testPrisma.goal.create({
    data: { title: "Correr 5 km", clientId: aluno.id, createdById: teacher.id },
  });
  await testPrisma.pointsEntry.create({
    data: { clientId: aluno.id, type: "ATTENDANCE", points: 10, occurredAt: new Date() },
  });
  await seedGamificationRules(testPrisma);
  // Regra ajustada à mão: o reset a devolve ao valor inicial.
  await testPrisma.gamificationRule.updateMany({
    where: { kind: "ATTENDANCE_POINTS" },
    data: { points: 999 },
  });
}

describe("Reset da demonstração: estado final e idempotência", () => {
  let databaseName: string;

  beforeAll(async () => {
    databaseName = await currentDatabaseName();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await plantDemoData();
  });

  const reset = (env = demoEnv()) =>
    runDemoReset({ env, confirmation: databaseName, prisma: testPrisma, migrate: noMigrate });

  it("deixa só o administrador inicial, os perfis de sistema e as regras de gamificação", async () => {
    await reset();

    expect(await stateSnapshot()).toEqual({
      users: [
        {
          email: "admin.demo@fitburn.test",
          fullName: "Administrador Demo",
          status: "ACTIVE",
          profile: "Administrador",
        },
      ],
      profiles: [
        { name: "Administrador", isSystem: true, isActive: true, access: [] },
        {
          name: "Cliente",
          isSystem: true,
          isActive: true,
          access: [{ module: "USUARIOS", actions: ["VIEW"], scope: "OWN" }],
        },
      ],
      rules: [
        { kind: "ATTENDANCE_POINTS", threshold: 0, points: 10 },
        { kind: "GOAL_POINTS", threshold: 0, points: 25 },
        { kind: "STREAK_MILESTONE", threshold: 3, points: 5 },
        { kind: "STREAK_MILESTONE", threshold: 5, points: 10 },
        { kind: "STREAK_MILESTONE", threshold: 10, points: 20 },
      ],
    });

    const seededTables = [
      "users",
      "access_profiles",
      "profile_module_access",
      "gamification_rules",
    ];
    for (const [table, rows] of Object.entries(await rowCountsByTable())) {
      if (!seededTables.includes(table)) expect({ table, rows }).toEqual({ table, rows: 0 });
    }
  });

  it("o administrador recriado entra com a senha do ambiente e a antiga deixa de valer", async () => {
    await reset();
    const app = await createTestApp();
    try {
      const ok = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: ADMIN_ENV.INITIAL_ADMIN_EMAIL, password: ADMIN_ENV.INITIAL_ADMIN_PASSWORD });
      const old = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: ADMIN_ENV.INITIAL_ADMIN_EMAIL, password: "SenhaAntiga123!" });

      expect(ok.status).toBe(201);
      expect(ok.body.accessToken).toEqual(expect.any(String));
      expect(old.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("é idempotente: rodar duas vezes seguidas produz o mesmo estado", async () => {
    await reset();
    const first = await stateSnapshot();
    const firstCounts = await rowCountsByTable();

    await reset();

    expect(await stateSnapshot()).toEqual(first);
    expect(await rowCountsByTable()).toEqual(firstCounts);
  });

  it("aplica as migrations antes de limpar e semear", async () => {
    const observed: number[] = [];

    await runDemoReset({
      env: demoEnv(),
      confirmation: databaseName,
      prisma: testPrisma,
      migrate: async () => {
        observed.push(await testPrisma.user.count());
      },
    });

    expect(observed).toEqual([3]);
    expect(await testPrisma.user.count()).toBe(1);
  });

  it("uma falha no seed desfaz a limpeza: os dados anteriores permanecem", async () => {
    // Um NUL no nome faz o Postgres rejeitar o insert do admin, depois do TRUNCATE.
    const env = demoEnv({ INITIAL_ADMIN_NAME: "Admin\u0000Invalido" });

    await expect(reset(env)).rejects.toBeDefined();

    expect(await testPrisma.user.count()).toBe(3);
    expect(await testPrisma.pointsEntry.count()).toBe(1);
  });
});

describe("Reset da demonstração: não existe endpoint de reset", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["/api/demo/reset", "/api/reset", "/api/admin/reset", "/api/demo-reset", "/api/demo"])(
    "POST/GET %s responde 404",
    async (path) => {
      const post = await request(app.getHttpServer()).post(path).send({});
      const get = await request(app.getHttpServer()).get(path);

      expect(post.status).toBe(404);
      expect(get.status).toBe(404);
    },
  );
});
