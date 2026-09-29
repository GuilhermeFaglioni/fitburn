import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const PROD_COMPOSE = readFileSync(file("docker-compose.prod.yml"), "utf8");
const LOCAL_COMPOSE = readFileSync(file("docker-compose.prod.local.yml"), "utf8");

/** Nomes das variáveis do bloco `x-api-environment` (lidos do YAML, sem precisar do Docker). */
function apiEnvironmentKeysFromYaml(): string[] {
  const block = /^x-api-environment:[^\n]*\n((?: {2}[^\n]*\n|\n)+)/m.exec(PROD_COMPOSE);
  if (!block) throw new Error("x-api-environment não encontrado em docker-compose.prod.yml");
  return [...block[1].matchAll(/^ {2}([A-Z_]+):/gm)].map((match) => match[1]);
}

/** Texto do serviço `name` (do YAML cru): recuo de 4+ espaços até o próximo serviço. */
function serviceBlock(yaml: string, name: string): string {
  const block = new RegExp(`^ {2}${name}:[^\\n]*\\n((?: {4}[^\\n]*\\n|[ \\t]*\\n)*)`, "m").exec(
    yaml,
  );
  if (!block) throw new Error(`serviço ${name} não encontrado`);
  return block[1];
}

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
    // Lê o YAML direto: o teste não depende do binário do Docker Compose.
    const composeEnvKeys = apiEnvironmentKeysFromYaml();
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
    // Um único ponto de build (migrate); a api só referencia a mesma imagem.
    expect(migrate.build).toBeDefined();
    expect(api.build).toBeUndefined();
    expect(api.image).toBe(migrate.image);
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

describe("Nginx: o comando não contorna o entrypoint da imagem", () => {
  // O `command` do Compose substitui o CMD da imagem, e o entrypoint oficial só roda
  // /docker-entrypoint.d/* (select-config.sh e o envsubst dos templates, que geram
  // o default.conf) quando o primeiro argumento é "nginx". Sem isso não há default.conf.
  it("docker-compose.prod.yml: o nginx sobe via /docker-entrypoint.sh nginx", () => {
    const nginx = serviceBlock(PROD_COMPOSE, "nginx");
    expect(nginx).toMatch(/exec \/docker-entrypoint\.sh nginx -g 'daemon off;'/);
    // Nenhum "nginx -g" solto (sem o entrypoint na frente) que pule os scripts de configuração.
    for (const line of nginx.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      if (/nginx -g/.test(line)) expect(line).toContain("/docker-entrypoint.sh nginx -g");
    }
  });

  it("docker-compose.prod.local.yml não redefine o command (herda o do prod)", () => {
    expect(serviceBlock(LOCAL_COMPOSE, "nginx")).not.toMatch(/^ {4}(command|entrypoint):/m);
  });

  it("monta o select-config.sh no diretório de scripts do entrypoint", () => {
    const nginx = serviceBlock(PROD_COMPOSE, "nginx");
    expect(nginx).toMatch(/select-config\.sh:\/docker-entrypoint\.d\/[0-9]+-select-config\.sh:ro/);
  });

  it("build e imagem da API: só o migrate constrói, a api nunca baixa de registry", () => {
    expect(serviceBlock(PROD_COMPOSE, "migrate")).toMatch(/^ {4}build:/m);
    const api = serviceBlock(PROD_COMPOSE, "api");
    expect(api).not.toMatch(/^ {4}build:/m);
    expect(api).toMatch(/^ {4}pull_policy: never$/m);
  });
});

describe.skipIf(!composeAvailable)("nginx no Compose resolvido", () => {
  it.each([
    ["docker-compose.prod.yml"],
    ["docker-compose.prod.yml", "docker-compose.prod.local.yml"],
  ])("o command final chama o entrypoint oficial (%s)", (...files) => {
    const config = composeConfig(files) as unknown as {
      services: { nginx: { command: string[] } };
    };
    expect(config.services.nginx.command.join("\n")).toContain(
      "/docker-entrypoint.sh nginx -g 'daemon off;'",
    );
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

describe("pnpm deploy:check (placeholder do rewrite da Vercel)", () => {
  const script = file("scripts/deploy-check.mjs");
  const run = (args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

  function vercelFixture(destination: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), "deploy-check-"));
    const target = path.join(dir, "vercel.json");
    writeFileSync(target, JSON.stringify({ rewrites: [{ source: "/api/:path*", destination }] }));
    return target;
  }

  it("sem --strict, o repositório passa mesmo com o placeholder (avisa, não falha)", () => {
    const result = run([]);
    expect(result.status).toBe(0);
  });

  it("com o placeholder, o aviso é claro e o --strict falha apontando o runbook", () => {
    const fixture = vercelFixture("https://api.fitburn.example/api/:path*");
    const warn = run(["--vercel-file", fixture]);
    expect(warn.status).toBe(0);
    expect(warn.stderr).toContain("api.fitburn.example");

    const strict = run(["--strict", "--vercel-file", fixture]);
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain("placeholder");
    expect(strict.stderr).toContain("docs/deploy-runbook.md");
  });

  it("com um domínio real, o --strict passa", () => {
    const fixture = vercelFixture("https://api.minhademo.com.br/api/:path*");
    const result = run(["--strict", "--vercel-file", fixture]);
    expect(result.status).toBe(0);
  });

  it("o runbook destaca a troca do placeholder no checklist pré-deploy", () => {
    const runbook = readFileSync(file("docs/deploy-runbook.md"), "utf8");
    expect(runbook).toContain("api.fitburn.example");
    expect(runbook).toContain("pnpm deploy:check --strict");
  });
});
