import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Navegação e layout (DS5, seção 5 do fluxo). Lê o CSS do disco.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const tokens = read("styles/tokens.css");
const global = read("styles/global.css");
const client = read("styles/client.css");
const admin = read("styles/admin.css");

describe("espaçamento e container", () => {
  it("escala de espaçamento base 4, de --s-1 (4px) a --s-24 (96px)", () => {
    for (let i = 1; i <= 24; i++) {
      expect(tokens, `--s-${i}`).toContain(`--s-${i}: ${i * 4}px;`);
    }
  });

  it("o container usa a largura máxima e o respiro lateral por token", () => {
    const body = global.match(/\.fb-container\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/max-width:\s*var\(--container-max\)/);
    expect(body).toMatch(/padding-inline:\s*var\(--container-gutter\)/);
    expect(body).not.toMatch(/padding(-inline)?:\s*\d/);
  });
});

describe("navegação do cliente", () => {
  it("item de navegação com alvo de 44px", () => {
    const body = client.match(/\.fb-client__nav-item\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/min-height:\s*44px/);
  });

  it("estado ativo também pela página atual (aria-current)", () => {
    expect(client).toMatch(/\.fb-client__nav-item\[aria-current="page"\]/);
  });
});

describe("tabela e diálogo", () => {
  it("a rolagem horizontal da tabela fica dentro do próprio componente", () => {
    const body = admin.match(/\.fb-table-wrap\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/overflow:\s*auto/);
  });

  it("linhas da tabela têm destaque ao passar o mouse", () => {
    expect(admin).toMatch(/\.fb-table-wrap tbody tr:hover > td/);
  });

  it("o diálogo usa o raio da marca e a sombra de diálogo (--sh-3)", () => {
    const body = admin.match(/\.fb-modal\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/box-shadow:\s*var\(--sh-3\)/);
    expect(admin).toMatch(/\.fb-modal\b[^{]*\{[^}]*border-radius:\s*var\(--radius-sm\)/);
  });
});
