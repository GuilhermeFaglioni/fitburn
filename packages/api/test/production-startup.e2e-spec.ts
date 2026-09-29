import { createApplication } from "../src/bootstrap/create-application.js";
import { AppConfigError, loadAppConfig } from "../src/config/app-config.js";
import { validProductionEnv } from "./production-env.js";

describe("Inicialização em produção (falha rápida)", () => {
  const criticalVariables = [
    "JWT_ACCESS_SECRET",
    "DATABASE_URL",
    "INITIAL_ADMIN_EMAIL",
    "INITIAL_ADMIN_PASSWORD",
    "INITIAL_ADMIN_NAME",
  ] as const;

  it.each(criticalVariables)("a API não inicia em produção sem %s", async (variable) => {
    const env: NodeJS.ProcessEnv = { ...validProductionEnv };
    delete env[variable];

    const error = await createApplication(env).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppConfigError);
    expect((error as AppConfigError).message).toContain(variable);
  });

  it.each(criticalVariables)("trata %s vazio como ausente", async (variable) => {
    const env: NodeJS.ProcessEnv = { ...validProductionEnv, [variable]: "   " };

    await expect(createApplication(env)).rejects.toBeInstanceOf(AppConfigError);
  });

  it("recusa o segredo de JWT de exemplo ou curto demais", async () => {
    for (const secret of ["dev-only-change-me", "test-secret", "curto"]) {
      await expect(
        createApplication({ ...validProductionEnv, JWT_ACCESS_SECRET: secret }),
      ).rejects.toBeInstanceOf(AppConfigError);
    }
  });

  it("recusa a senha do admin inicial de exemplo ou fraca", async () => {
    for (const password of ["TrocarEssaSenha123!", "curta"]) {
      await expect(
        createApplication({ ...validProductionEnv, INITIAL_ADMIN_PASSWORD: password }),
      ).rejects.toBeInstanceOf(AppConfigError);
    }
  });

  it("lista todos os problemas de uma vez, sem revelar os valores dos segredos", () => {
    const env: NodeJS.ProcessEnv = {
      ...validProductionEnv,
      JWT_ACCESS_SECRET: "curto",
      INITIAL_ADMIN_EMAIL: undefined,
    };

    let message = "";
    try {
      loadAppConfig(env);
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain("JWT_ACCESS_SECRET");
    expect(message).toContain("INITIAL_ADMIN_EMAIL");
    expect(message).not.toContain("curto");
  });

  it("aceita uma configuração de produção completa", () => {
    const config = loadAppConfig({ ...validProductionEnv });

    expect(config.isProduction).toBe(true);
  });

  it.each(["test", "development"])("só NODE_ENV=%s é tratado como não-produção", (nodeEnv) => {
    const config = loadAppConfig({ NODE_ENV: nodeEnv });

    expect(config.isProduction).toBe(false);
  });

  it.each([undefined, "", "prod", "staging", "Production", "producao"])(
    "NODE_ENV=%j aplica as travas de produção (falha fechada)",
    (nodeEnv) => {
      const env: NodeJS.ProcessEnv = nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv };

      expect(() => loadAppConfig(env)).toThrow(AppConfigError);
      const config = loadAppConfig({ ...validProductionEnv, NODE_ENV: nodeEnv });
      expect(config.isProduction).toBe(true);
      expect(config.refreshCookie.secure).toBe(true);
      expect(config.authRateLimit.enabled).toBe(true);
      expect(config.corsOrigins).toEqual([]);
    },
  );

  it("aceita NODE_ENV=development/test com espaços e caixa diferente", () => {
    expect(loadAppConfig({ NODE_ENV: " Development " }).isProduction).toBe(false);
  });
});
