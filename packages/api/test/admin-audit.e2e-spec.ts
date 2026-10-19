import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

type AuditEvent = {
  actorId: string;
  action: string;
  targetId: string;
  changedFields: string[];
};

describe("Trilha de auditoria administrativa (HTTP)", () => {
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

  async function loginAsAdmin() {
    const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const user = await createUser({
      email: "admin@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { user, token };
  }

  async function readAuditEvents(): Promise<AuditEvent[]> {
    return testPrisma.$queryRaw<AuditEvent[]>`
      SELECT "actorId", "action", "targetId", "changedFields"
      FROM "admin_audit_events"
      ORDER BY "createdAt", "id"
    `;
  }

  it("registra criação de cliente com IDs e nomes de campos, sem valores pessoais", async () => {
    const { user: actor, token } = await loginAsAdmin();
    await createAccessProfile({ name: "Cliente", isSystem: true });

    const personalValues = [
      "cliente.auditoria@fitburn.local",
      "Cliente Sob Auditoria",
      "31999991111",
      "12345678900",
      "Rua Confidencial, 123",
      "SenhaPrivada#456",
      "1990-05-20",
    ];
    const response = await request(app.getHttpServer())
      .post("/api/users/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: personalValues[1],
        email: personalValues[0],
        phone: personalValues[2],
        birthDate: "1990-05-20",
        document: personalValues[3],
        address: personalValues[4],
        password: personalValues[5],
      });

    expect(response.status).toBe(201);
    const events = await readAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: actor.id,
      action: "USER_CREATED",
      targetId: response.body.id,
      changedFields: expect.arrayContaining([
        "fullName",
        "email",
        "phone",
        "birthDate",
        "document",
        "address",
      ]),
    });
    const auditContents = JSON.stringify(events);
    for (const value of personalValues) expect(auditContents).not.toContain(value);
  }, 30_000);

  it("registra criação por Clientes, edição e troca de perfil", async () => {
    const { user: actor, token } = await loginAsAdmin();
    await createAccessProfile({ name: "Cliente", isSystem: true });
    const staffProfile = await createAccessProfile({ name: "Recepção" });
    const replacementProfile = await createAccessProfile({ name: "Coordenação" });

    const client = await request(app.getHttpServer())
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Cliente Rota Alternativa",
        email: "cliente.rota@fitburn.local",
        phone: "31999992222",
        birthDate: "1990-05-20",
        document: "22222222222",
        address: "Rua Privada, 456",
        password: "SenhaCliente#123",
      });
    expect(client.status).toBe(201);

    const staff = await request(app.getHttpServer())
      .post("/api/users/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Funcionário Inicial",
        email: "funcionario.auditoria@fitburn.local",
        password: "SenhaEquipe#123",
        profileId: staffProfile.id,
      });
    expect(staff.status).toBe(201);

    const update = await request(app.getHttpServer())
      .patch(`/api/users/${staff.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Funcionário Revisado" });
    expect(update.status).toBe(200);

    const profileChange = await request(app.getHttpServer())
      .patch(`/api/users/${staff.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ profileId: replacementProfile.id });
    expect(profileChange.status).toBe(200);

    const unchangedProfile = await request(app.getHttpServer())
      .patch(`/api/users/${staff.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ profileId: replacementProfile.id });
    expect(unchangedProfile.status).toBe(200);

    const events = await readAuditEvents();
    expect(events).toHaveLength(4);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_CREATED",
          targetId: client.body.id,
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_CREATED",
          targetId: staff.body.id,
          changedFields: expect.arrayContaining(["password", "profileId"]),
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_UPDATED",
          targetId: staff.body.id,
          changedFields: ["fullName"],
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_PROFILE_CHANGED",
          targetId: staff.body.id,
          changedFields: ["profileId"],
        }),
      ]),
    );
    const auditContents = JSON.stringify(events);
    for (const value of [
      "Cliente Rota Alternativa",
      "cliente.rota@fitburn.local",
      "31999992222",
      "22222222222",
      "Rua Privada, 456",
      "SenhaCliente#123",
      "Funcionário Inicial",
      "funcionario.auditoria@fitburn.local",
      "SenhaEquipe#123",
      "Funcionário Revisado",
    ]) {
      expect(auditContents).not.toContain(value);
    }
  }, 60_000);

  it("registra desativação, reativação, redefinição de senha e exclusão", async () => {
    const { user: actor, token } = await loginAsAdmin();
    const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const target = await createUser({
      email: "alvo.auditoria@fitburn.local",
      fullName: "Alvo Confidencial",
      password: "SenhaAntiga#123",
      profileId: clientProfile.id,
      document: "33333333333",
    });

    const deactivated = await request(app.getHttpServer())
      .post(`/api/users/${target.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(deactivated.status).toBe(201);

    const reactivated = await request(app.getHttpServer())
      .post(`/api/users/${target.id}/reactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(reactivated.status).toBe(201);

    const newPassword = "SenhaNova#789";
    const reset = await request(app.getHttpServer())
      .post(`/api/users/${target.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword });
    expect(reset.status).toBe(204);

    const deleted = await request(app.getHttpServer())
      .delete(`/api/users/${target.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleted.status).toBe(200);

    const events = await readAuditEvents();
    expect(events).toHaveLength(4);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_DEACTIVATED",
          targetId: target.id,
          changedFields: ["status"],
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_REACTIVATED",
          targetId: target.id,
          changedFields: ["status"],
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_PASSWORD_RESET",
          targetId: target.id,
          changedFields: ["password"],
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "USER_DELETED",
          targetId: target.id,
          changedFields: expect.arrayContaining([
            "fullName",
            "email",
            "password",
            "phone",
            "birthDate",
            "document",
            "address",
            "status",
          ]),
        }),
      ]),
    );
    const auditContents = JSON.stringify(events);
    for (const value of [
      target.email,
      target.fullName,
      target.document!,
      "SenhaAntiga#123",
      "SenhaNova#789",
    ]) {
      expect(auditContents).not.toContain(value);
    }
  }, 60_000);

  it("registra alterações da matriz sem persistir os valores das permissões", async () => {
    const { user: actor, token } = await loginAsAdmin();
    const profile = await createAccessProfile({ name: "Matriz auditada" });

    const grant = await request(app.getHttpServer())
      .put(`/api/profiles/${profile.id}/module-access/CLIENTES`)
      .set("Authorization", `Bearer ${token}`)
      .send({ actions: ["VIEW", "EDIT"], scope: "ALL" });
    expect(grant.status).toBe(200);

    const revoke = await request(app.getHttpServer())
      .put(`/api/profiles/${profile.id}/module-access/CLIENTES`)
      .set("Authorization", `Bearer ${token}`)
      .send({ actions: [], scope: "OWN" });
    expect(revoke.status).toBe(200);

    const events = await readAuditEvents();
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: actor.id,
          action: "PROFILE_PERMISSIONS_CHANGED",
          targetId: profile.id,
          changedFields: ["actions", "scope"],
        }),
        expect.objectContaining({
          actorId: actor.id,
          action: "PROFILE_PERMISSIONS_CHANGED",
          targetId: profile.id,
          changedFields: ["actions", "scope"],
        }),
      ]),
    );
    const auditContents = JSON.stringify(events);
    for (const value of ["VIEW", "EDIT", "ALL", "OWN", "CLIENTES", profile.name]) {
      expect(auditContents).not.toContain(value);
    }

    await expect(
      testPrisma.$executeRaw`UPDATE "admin_audit_events" SET "changedFields" = ARRAY['leaked']::TEXT[]`,
    ).rejects.toThrow("Admin audit events are append-only");
  }, 60_000);

  it("reverte a ação quando a gravação da trilha falha", async () => {
    const { token } = await loginAsAdmin();
    await createAccessProfile({ name: "Cliente", isSystem: true });

    try {
      await testPrisma.$executeRawUnsafe(`
        CREATE FUNCTION test_reject_admin_audit_event() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'forced audit insert failure';
        END;
        $$
      `);
      await testPrisma.$executeRawUnsafe(`
        CREATE TRIGGER test_reject_admin_audit_event
        BEFORE INSERT ON "admin_audit_events"
        FOR EACH ROW EXECUTE FUNCTION test_reject_admin_audit_event()
      `);

      const response = await request(app.getHttpServer())
        .post("/api/users/clients")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Rollback de Auditoria",
          email: "rollback.auditoria@fitburn.local",
          phone: "31977776666",
          birthDate: "1990-05-20",
          document: "44444444444",
          address: "Rua de Teste, 1",
          password: "SenhaRollback#123",
        });
      expect(response.status).toBe(500);
    } finally {
      await testPrisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS test_reject_admin_audit_event ON "admin_audit_events"',
      );
      await testPrisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_reject_admin_audit_event()");
    }

    const createdUser = await testPrisma.user.findUnique({
      where: { email: "rollback.auditoria@fitburn.local" },
    });
    expect(createdUser).toBeNull();
    expect(await readAuditEvents()).toHaveLength(0);
  }, 60_000);
});
