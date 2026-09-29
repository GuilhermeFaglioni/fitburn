import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * O service worker só existe no build de produção, então o seam aqui é o
 * artefato gerado (sw.js e manifest), não o código-fonte da configuração.
 */
describe("PWA: build de produção", () => {
  let outDir: string;
  let sw: string;
  let manifest: {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    theme_color: string;
    icons: Array<{ src: string; type: string }>;
  };

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "fitburn-pwa-"));
    execFileSync("pnpm", ["exec", "vite", "build", "--outDir", outDir, "--emptyOutDir"], {
      cwd: join(__dirname, ".."),
      stdio: "pipe",
      // O vitest roda com NODE_ENV=test; o sw de produção (minificado) é o que vai para o ar.
      env: { ...process.env, NODE_ENV: "production" },
    });
    sw = readFileSync(join(outDir, "sw.js"), "utf8");
    manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8"));
  }, 120_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("o manifest torna o app instalável em tela cheia, com o nome e o ícone da Fitburn", () => {
    expect(manifest.name).toBe("Fitburn");
    expect(manifest.short_name).toBe("Fitburn");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toBe("#0a0a0a");
    expect(manifest.icons.map((icon) => icon.src)).toContain("flame.svg");
  });

  it("o service worker pré-carrega só a casca: index.html e os assets do build", () => {
    const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);

    expect(urls).toContain("index.html");
    expect(urls.some((url) => /^assets\/index-.*\.js$/.test(url))).toBe(true);
    expect(urls.filter((url) => url.includes("api"))).toEqual([]);
  });

  it("nenhuma requisição de API passa pelo cache: sem regras de runtime e /api fora do fallback de navegação", () => {
    // A única rota registrada é o fallback de navegação para o index.html...
    expect(sw.match(/registerRoute\(/g)).toHaveLength(1);
    expect(sw).toMatch(/registerRoute\(new \w+\.NavigationRoute\(/);
    // ...que nunca vale para /api...
    expect(sw).toContain("denylist:[/^\\/api\\//]");
    // ...e não há estratégia de cache de dados (NetworkFirst, CacheFirst, StaleWhileRevalidate...).
    expect(sw).not.toMatch(/NetworkFirst|CacheFirst|StaleWhileRevalidate|CacheOnly|NetworkOnly/);
  });

  it("uma versão nova espera o aviso do app: só assume o controle ao receber SKIP_WAITING", () => {
    expect(sw).toContain("SKIP_WAITING");
    // skipWaiting() só dentro do handler da mensagem, nunca incondicional na instalação.
    expect(sw).not.toMatch(/\.skipWaiting\(\),/);
    expect(sw).not.toContain("clientsClaim()");
  });
});
