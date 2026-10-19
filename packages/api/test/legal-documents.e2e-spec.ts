import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { OnboardingRequirement } from "@fitburn/contracts";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createAccessProfile, createUser } from "./factories.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";

function legalConfig(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    PRIVACY_POLICY_VERSION: "v1",
    PRIVACY_POLICY_REQUIRES_NEW_MANIFESTATION: "true",
    TERMS_OF_USE_VERSION: "v1",
    TERMS_OF_USE_REQUIRES_NEW_MANIFESTATION: "true",
    ...overrides,
  };
}

describe("Documentos legais e manifestações (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ env: legalConfig() });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function loginUser(email = "marina@fitburn.local", mustChangePassword = false) {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({ email, password: PASSWORD, profileId: profile.id });
    if (mustChangePassword) {
      await testPrisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    }
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    return { user, login, accessToken: login.body.accessToken as string };
  }

  it("publica versões vigentes e conteúdo provisório sem exigir sessão", async () => {
    const privacy = await request(app.getHttpServer()).get("/api/legal-documents/privacy-policy");
    const terms = await request(app.getHttpServer()).get("/api/legal-documents/terms-of-use");

    expect(privacy.status).toBe(200);
    expect(privacy.body).toMatchObject({
      type: "PRIVACY_POLICY",
      version: "v1",
      requiresNewManifestation: true,
    });
    expect(privacy.body.content).toContain("CONTEÚDO PROVISÓRIO");
    expect(terms.status).toBe(200);
    expect(terms.body).toMatchObject({ type: "TERMS_OF_USE", version: "v1" });
    expect(terms.body.content).toContain("CONTEÚDO PROVISÓRIO");
  });

  it("exige ciência e aceite em registros distintos antes de liberar o app", async () => {
    const { user, login, accessToken } = await loginUser();
    expect(login.body.user.onboardingPending).toEqual([
      OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT,
      OnboardingRequirement.TERMS_ACCEPTANCE,
    ]);

    const blocked = await request(app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("ONBOARDING_REQUIRED");
    expect(blocked.body.details.pending).toEqual([
      OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT,
      OnboardingRequirement.TERMS_ACCEPTANCE,
    ]);

    const privacy = await request(app.getHttpServer())
      .post("/api/onboarding/privacy-acknowledgement")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(privacy.status).toBe(201);
    expect(privacy.body.manifestation).toMatchObject({
      userId: user.id,
      type: "PRIVACY_ACKNOWLEDGED",
      version: "v1",
      action: "GRANTED",
    });
    expect(privacy.body.onboardingPending).toEqual([OnboardingRequirement.TERMS_ACCEPTANCE]);

    const repeatedPrivacy = await request(app.getHttpServer())
      .post("/api/onboarding/privacy-acknowledgement")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(repeatedPrivacy.body.manifestation.id).not.toBe(privacy.body.manifestation.id);

    const terms = await request(app.getHttpServer())
      .post("/api/onboarding/terms-acceptance")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(terms.status).toBe(201);
    expect(terms.body.manifestation).toMatchObject({
      userId: user.id,
      type: "TERMS_ACCEPTED",
      version: "v1",
      action: "GRANTED",
    });
    expect(terms.body.manifestation.id).not.toBe(privacy.body.manifestation.id);
    expect(terms.body.onboardingPending).toEqual([]);

    const domain = await request(app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(domain.body.code).toBe("FORBIDDEN");
  });

  it("reabre só os documentos que exigem nova manifestação para a versão ativa", async () => {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    const user = await createUser({
      email: "versoes@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    await testPrisma.userManifestation.createMany({
      data: [
        {
          userId: user.id,
          type: "PRIVACY_ACKNOWLEDGED",
          version: "v1",
          action: "GRANTED",
        },
        { userId: user.id, type: "TERMS_ACCEPTED", version: "v1", action: "GRANTED" },
      ],
    });

    const appWithNewVersions = await createTestApp({
      env: legalConfig({
        PRIVACY_POLICY_VERSION: "v2",
        PRIVACY_POLICY_REQUIRES_NEW_MANIFESTATION: "true",
        TERMS_OF_USE_VERSION: "v2",
        TERMS_OF_USE_REQUIRES_NEW_MANIFESTATION: "false",
      }),
    });
    try {
      const login = await request(appWithNewVersions.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "versoes@fitburn.local", password: PASSWORD });
      expect(login.body.user.onboardingPending).toEqual([
        OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT,
      ]);

      const privacy = await request(appWithNewVersions.getHttpServer()).get(
        "/api/legal-documents/privacy-policy",
      );
      const terms = await request(appWithNewVersions.getHttpServer()).get(
        "/api/legal-documents/terms-of-use",
      );
      expect(privacy.body).toMatchObject({ version: "v2", requiresNewManifestation: true });
      expect(terms.body).toMatchObject({ version: "v2", requiresNewManifestation: false });
    } finally {
      await appWithNewVersions.close();
    }
  });

  it("exige a troca de senha antes da ciência e do aceite, sem duplicar o gate", async () => {
    const { login, accessToken } = await loginUser("senha-e-documentos@fitburn.local", true);
    expect(login.body.user.onboardingPending).toEqual([
      OnboardingRequirement.PASSWORD_CHANGE,
      OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT,
      OnboardingRequirement.TERMS_ACCEPTANCE,
    ]);

    const changed = await request(app.getHttpServer())
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: "SenhaNova456!" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.onboardingPending).toEqual([
      OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT,
      OnboardingRequirement.TERMS_ACCEPTANCE,
    ]);

    const blocked = await request(app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${changed.body.accessToken as string}`);
    expect(blocked.body.code).toBe("ONBOARDING_REQUIRED");
    expect(blocked.body.details.pending).toEqual([
      OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT,
      OnboardingRequirement.TERMS_ACCEPTANCE,
    ]);
  });
});
