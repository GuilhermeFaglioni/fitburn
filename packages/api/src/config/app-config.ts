/**
 * Configuração da API lida do ambiente e validada uma única vez, na
 * inicialização. Em produção qualquer configuração crítica ausente ou
 * insegura derruba o boot (falha rápida); só com NODE_ENV=development ou
 * NODE_ENV=test (explícito) os valores de desenvolvimento/teste valem.
 */

export const APP_CONFIG = Symbol("APP_CONFIG");

export interface AppConfig {
  isProduction: boolean;
  refreshCookie: {
    /** Só enviado por HTTPS. Em desenvolvimento/teste (http://localhost) ficaria inutilizável. */
    secure: boolean;
    sameSite: "lax" | "strict";
  };
  /**
   * Origens autorizadas a chamar a API de outro domínio. `"any"` só fora de
   * produção (o Vite proxy e o dev server usam origens variadas); em
   * produção a lista vem de CORS_ALLOWED_ORIGINS e, vazia, bloqueia todo
   * acesso cruzado (web e API na mesma origem, atrás do mesmo Nginx).
   */
  corsOrigins: string[] | "any";
  /**
   * Quantos proxies reversos (Nginx) ficam entre o cliente e a API. Define
   * de onde sai o IP do cliente (X-Forwarded-For) usado pelo rate limit:
   * com 0 o header é ignorado, pois qualquer cliente poderia forjá-lo.
   */
  trustProxyHops: number;
  /** Limite de tentativas de login que falharam (POST /auth/login), por IP. */
  authRateLimit: { enabled: boolean; max: number; windowMs: number };
}

export class AppConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Configuração de produção inválida — a API não vai iniciar:\n${problems
        .map((problem) => `  - ${problem}`)
        .join("\n")}`,
    );
    this.name = "AppConfigError";
  }
}

const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;
const DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS = 60;
const MIN_JWT_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** Valores de exemplo do `.env.example`/testes: nunca aceitos em produção. */
const PLACEHOLDER_SECRETS = new Set(["dev-only-change-me", "test-secret", "changeme"]);
const PLACEHOLDER_ADMIN_PASSWORDS = new Set(["TrocarEssaSenha123!"]);

const REQUIRED_IN_PRODUCTION = [
  "JWT_ACCESS_SECRET",
  "DATABASE_URL",
  "INITIAL_ADMIN_EMAIL",
  "INITIAL_ADMIN_PASSWORD",
  "INITIAL_ADMIN_NAME",
] as const;

function value(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

/**
 * Nunca inclui o valor das variáveis nas mensagens de erro: o problema vai
 * para o log de boot e um segredo recusado não pode vazar por ali.
 */
function validateProductionEnv(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!value(env, name)) problems.push(`${name} é obrigatório em produção.`);
  }

  const jwtSecret = value(env, "JWT_ACCESS_SECRET");
  if (jwtSecret && (PLACEHOLDER_SECRETS.has(jwtSecret) || jwtSecret.length < MIN_JWT_SECRET_LENGTH)) {
    problems.push(
      `JWT_ACCESS_SECRET é um valor de exemplo ou tem menos de ${MIN_JWT_SECRET_LENGTH} caracteres.`,
    );
  }

  const adminPassword = value(env, "INITIAL_ADMIN_PASSWORD");
  if (
    adminPassword &&
    (PLACEHOLDER_ADMIN_PASSWORDS.has(adminPassword) || adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH)
  ) {
    problems.push(
      `INITIAL_ADMIN_PASSWORD é a senha de exemplo ou tem menos de ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  const corsProblem = validateCorsOrigins(value(env, "CORS_ALLOWED_ORIGINS"));
  if (corsProblem) problems.push(corsProblem);

  for (const [name, minimum] of [
    ["AUTH_RATE_LIMIT_MAX", 1],
    ["AUTH_RATE_LIMIT_WINDOW_SECONDS", 1],
    ["TRUST_PROXY_HOPS", 0],
  ] as const) {
    if (value(env, name) !== undefined && parseInteger(value(env, name), minimum) === undefined) {
      problems.push(`${name} deve ser um número inteiro maior ou igual a ${minimum}.`);
    }
  }

  return problems;
}

function parseInteger(raw: string | undefined, minimum: number): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return parsed >= minimum ? parsed : undefined;
}

function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === origin;
  } catch {
    return false;
  }
}

function validateCorsOrigins(raw: string | undefined): string | undefined {
  const invalid = parseCorsOrigins(raw).some((origin) => !isValidOrigin(origin));
  return invalid
    ? "CORS_ALLOWED_ORIGINS deve listar origens completas separadas por vírgula (ex.: https://app.exemplo.com), sem curinga, caminho ou barra final."
    : undefined;
}

/**
 * Falha fechada: só `development` e `test` (explícitos) liberam o
 * comportamento de desenvolvimento. NODE_ENV ausente, `prod`, `staging`,
 * com typo etc. contam como produção e recebem todas as travas.
 */
function isProductionEnvironment(env: NodeJS.ProcessEnv): boolean {
  const mode = env.NODE_ENV?.trim().toLowerCase();
  return mode !== "development" && mode !== "test";
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = isProductionEnvironment(env);

  if (isProduction) {
    const problems = validateProductionEnv(env);
    if (problems.length > 0) throw new AppConfigError(problems);
  }

  const corsOrigins = parseCorsOrigins(value(env, "CORS_ALLOWED_ORIGINS"));

  return {
    isProduction,
    refreshCookie: { secure: isProduction, sameSite: "lax" },
    corsOrigins: isProduction || corsOrigins.length > 0 ? corsOrigins : "any",
    // Em produção a API roda atrás do Nginx (docs/architecture-overview.md).
    trustProxyHops: parseInteger(value(env, "TRUST_PROXY_HOPS"), 0) ?? (isProduction ? 1 : 0),
    authRateLimit: {
      // Testes e desenvolvimento fazem muitos logins seguidos do mesmo IP.
      enabled: isProduction || env.AUTH_RATE_LIMIT_ENABLED === "true",
      max: parseInteger(value(env, "AUTH_RATE_LIMIT_MAX"), 1) ?? DEFAULT_AUTH_RATE_LIMIT_MAX,
      windowMs:
        (parseInteger(value(env, "AUTH_RATE_LIMIT_WINDOW_SECONDS"), 1) ??
          DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS) * 1000,
    },
  };
}
