import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { AppConfigError, loadAppConfig } from "../src/config/app-config.js";

/**
 * Contrato dos artefatos de deploy (issue #51): o que a API exige para subir
 * em produção precisa estar no arquivo de exemplo e no Compose de produção.
 * Aqui não sobe contêiner nenhum; só lê os arquivos (e, se o binário do
 * Docker Compose existir, usa `docker compose config` para resolver o YAML).
 */
const ROOT = path.resolve(__dirname, "../../..");
const file = (...parts: string[]): string => path.join(ROOT, ...parts);

const EXAMPLE_ENV = dotenv.parse(readFileSync(file(".env.production.example")));

/** Lê a lista REQUIRED_IN_PRODUCTION direto do código da API, a fonte da verdade. */
function requiredInProduction(): string[] {
  const source = readFileSync(path.resolve(__dirname, "../src/config/app-config.ts"), "utf8");
  const block = /REQUIRED_IN_PRODUCTION\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!block) throw new Error("REQUIRED_IN_PRODUCTION não encontrado em app-config.ts");
  return [...block[1].matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
}

/** Valores fortes de mentira, só para o teste (nada disso vai a produção). */
const FILLED_SECRETS = {
  DOMAIN: "api.fitburn.example",
  LETSENCRYPT_EMAIL: "ops@fitburn.example",
  POSTGRES_PASSWORD: "0123456789abcdef0123456789abcdef",
  JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef",
  INITIAL_ADMIN_EMAIL: "admin@fitburn.example",
  INITIAL_ADMIN_PASSWORD: "uma-senha-forte-de-teste",
};

describe(".env.production.example", () => {
  it("declara as variáveis exigidas pela API em produção (direto ou via Compose)", () => {
    const composeEnvKeys = Object.keys(composeConfig()?.services.api.environment ?? {});
    for (const name of requiredInProduction()) {
      const provided = name in EXAMPLE_ENV || composeEnvKeys.includes(name);
      expect(provided, `${name} não chega à API`).toBe(true);
    }
  });

  it("não traz nenhum segredo real: sem preenchimento a API recusa iniciar", () => {
    const env = { ...EXAMPLE_ENV, DATABASE_URL: "postgresql://x:x@postgres:5432/x" };
    expect(() => loadAppConfig({ ...env, NODE_ENV: "production" })).toThrow(AppConfigError);
    try {
      loadAppConfig({ ...env, NODE_ENV: "production" });
    } catch (error) {
      const problems = (error as AppConfigError).problems.join("\n");
      expect(problems).toContain("JWT_ACCESS_SECRET");
      expect(problems).toContain("INITIAL_ADMIN_EMAIL");
      expect(problems).toContain("INITIAL_ADMIN_PASSWORD");
    }
  });

  it("preenchido com segredos fortes, a API aceita a configuração como produção", () => {
    const config = loadAppConfig({
      ...EXAMPLE_ENV,
      ...FILLED_SECRETS,
      DATABASE_URL: "postgresql://x:x@postgres:5432/x",
      NODE_ENV: "production",
    });
    expect(config.isProduction).toBe(true);
    expect(config.refreshCookie.secure).toBe(true);
    // Atrás do Nginx e do rewrite da Vercel: dois saltos até o IP do cliente.
    expect(config.trustProxyHops).toBe(2);
  });
});

interface ComposeService {
  image?: string;
  build?: unknown;
  ports?: unknown[];
  expose?: string[];
  volumes?: { type: string; source?: string; target: string }[];
  networks?: Record<string, unknown>;
  environment?: Record<string, string | null>;
  depends_on?: Record<string, { condition: string }>;
}
interface ComposeConfig {
  services: Record<string, ComposeService>;
  networks: Record<string, { internal?: boolean }>;
  volumes: Record<string, unknown>;
}

const composeAvailable = spawnSync("docker", ["compose", "version"]).status === 0;

function composeConfig(files = ["docker-compose.prod.yml"]): ComposeConfig | undefined {
  if (!composeAvailable) return undefined;
  const args = files.flatMap((name) => ["-f", file(name)]);
  const output = execFileSync(
    "docker",
    [
      "compose",
      ...args,
      "--env-file",
      file(".env.production.example"),
      "config",
      "--format",
      "json",
    ],
    {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...FILLED_SECRETS },
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as ComposeConfig;
}

describe.skipIf(!composeAvailable)("docker-compose.prod.yml", () => {
  const config = composeConfig() as ComposeConfig;

  it("tem Nginx como única entrada: só ele publica portas (80 e 443)", () => {
    const published = Object.entries(config.services).filter(
      ([, service]) => (service.ports ?? []).length > 0,
    );
    expect(published.map(([name]) => name)).toEqual(["nginx"]);
    const ports = (config.services.nginx.ports as { target: number }[]).map((p) => p.target);
    expect(ports.sort((a, b) => a - b)).toEqual([80, 443]);
  });

  it("mantém o PostgreSQL só na rede interna, com volume persistente", () => {
    const postgres = config.services.postgres;
    expect(postgres.ports ?? []).toEqual([]);
    expect(Object.keys(postgres.networks ?? {})).toEqual(["internal"]);
    expect(config.networks.internal.internal).toBe(true);
    const data = postgres.volumes?.find((v) => v.target === "/var/lib/postgresql/data");
    expect(data?.type).toBe("volume");
    expect(data?.source).toBeTruthy();
  });

  it("expõe a API só internamente e passa a ela as variáveis exigidas em produção", () => {
    const api = config.services.api;
    expect(api.ports ?? []).toEqual([]);
    expect(api.expose).toContain("3333");
    expect(Object.keys(api.networks ?? {})).toEqual(["internal"]);
    expect(api.environment?.NODE_ENV).toBe("production");
    for (const name of requiredInProduction()) {
      expect(api.environment?.[name], `${name} ausente no serviço api`).toBeTruthy();
    }
  });

  it("roda as migrations em passo dedicado, antes de a API subir", () => {
    const { migrate, api } = config.services;
    expect(migrate).toBeDefined();
    expect(migrate.build).toEqual(api.build);
    expect(api.depends_on?.migrate.condition).toBe("service_completed_successfully");
    expect(migrate.depends_on?.postgres.condition).toBe("service_healthy");
  });

  it("exige na hora do Compose toda variável obrigatória que o exemplo declara vazia", () => {
    const source = readFileSync(file("docker-compose.prod.yml"), "utf8");
    const mandatory = [...source.matchAll(/\$\{([A-Z_]+):\?/g)].map((match) => match[1]);
    expect(mandatory.length).toBeGreaterThan(0);
    for (const name of mandatory) expect(Object.keys(EXAMPLE_ENV)).toContain(name);
  });

  it("a variante local (sem TLS) não publica 80/443 nem sobe o certbot", () => {
    const local = composeConfig(["docker-compose.prod.yml", "docker-compose.prod.local.yml"])!;
    const ports = (local.services.nginx.ports as { target: number; published: string }[]).map(
      (p) => `${p.published}:${p.target}`,
    );
    expect(ports).toEqual(["8080:80"]);
    expect(local.services.nginx.environment?.NGINX_MODE).toBe("local");
    expect(local.services.postgres.ports ?? []).toEqual([]);
    expect(local.services.certbot).toBeUndefined();
  });
});

describe("vercel.json", () => {
  const vercel = JSON.parse(readFileSync(file("vercel.json"), "utf8")) as {
    rewrites: { source: string; destination: string }[];
  };

  it("reescreve /api para o backend antes do fallback do SPA", () => {
    const [api, ...rest] = vercel.rewrites;
    expect(api.source).toBe("/api/:path*");
    expect(api.destination).toMatch(/^https:\/\/[^/]+\/api\/:path\*$/);
    expect(rest.map((rewrite) => rewrite.destination)).toEqual(["/index.html"]);
  });
});

describe("artefatos do Nginx e do runbook", () => {
  it.each(["local", "bootstrap", "tls"])("existe o template %s", (name) => {
    expect(existsSync(file("docker/nginx/templates", `${name}.conf.template`))).toBe(true);
  });

  it("o runbook cobre migrations, saúde e reset da demo", () => {
    const runbook = readFileSync(file("docs/deploy-runbook.md"), "utf8");
    for (const term of ["prisma migrate deploy", "/api/health", "pnpm demo:reset", "DOMAIN"]) {
      expect(runbook).toContain(term);
    }
  });
});
